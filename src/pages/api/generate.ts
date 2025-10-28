// #vercel-disable-blocks
import { ProxyAgent, fetch } from 'undici'
// #vercel-end
import { generatePayload, parseOpenAIStream } from '@/utils/openAI'
import { verifySignature } from '@/utils/auth'
import { getMCPManager } from '@/utils/mcpClient'
import { initializeMCP } from '@/utils/mcpInit'
import { fetchWebpage, formatSearchResults, searchWeb } from '@/utils/webSearchDirect'
import type { APIRoute } from 'astro'
import type { ChatMessage } from '@/types'

const apiKey = import.meta.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD
const ua = import.meta.env.UNDICI_UA
const enableMCP = import.meta.env.ENABLE_MCP === 'true'
const isVercel = !!import.meta.env.VERCEL || process.env.VERCEL === '1'

const FORWARD_HEADERS = ['origin', 'referer', 'cookie', 'user-agent', 'via']

// Initialize MCP on first request (only for local development)
let mcpInitPromise: Promise<void> | null = null
if (enableMCP && !mcpInitPromise && !isVercel) {
  mcpInitPromise = initializeMCP()
  // eslint-disable-next-line no-console
  console.log('[MCP] Using MCP SDK (local mode)')
} else if (enableMCP && isVercel) {
  // eslint-disable-next-line no-console
  console.log('[WebSearch] Using direct functions (Vercel mode)')
}

export const POST: APIRoute = async({ request }) => {
  const body = await request.json()
  const { sign, time, messages, pass } = body
  if (!messages) {
    return new Response(JSON.stringify({
      error: {
        message: 'No input text.',
      },
    }), { status: 400 })
  }
  if (sitePassword && sitePassword !== pass) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid password.',
      },
    }), { status: 401 })
  }
  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages?.[messages.length - 1]?.content || '' }, sign)) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid signature.',
      },
    }), { status: 401 })
  }

  // Wait for MCP initialization to complete
  if (enableMCP && mcpInitPromise)
    await mcpInitPromise

  // Add system message for MCP tools if enabled and no system message exists
  let requestMessageList = messages
  if (enableMCP && (!messages[0] || messages[0].role !== 'system')) {
    requestMessageList = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant with web search tools.\n\n🚨 CRITICAL WORKFLOW:\n\n1. For CURRENT DATE/TIME queries:\n   - Use fetch_webpage("https://www.timeanddate.com/")\n   - Extract and state the actual date directly\n\n2. For MOVIES/NEWS/EVENTS queries - BE SMART:\n\n   STRATEGY A - Try search snippets FIRST (FASTER!):\n   - Use search_web("latest movies 2025")\n   - READ the snippets carefully\n   - If snippets contain enough movie names/info → Answer directly from snippets\n   - ✅ Example: Snippet says "Wicked, Gladiator 2, Moana 2" → Use that!\n\n   STRATEGY B - Only fetch if snippets are empty/vague:\n   - If snippets don\'t have actual names → Use fetch_webpage\n   - Pick first good URL → Scrape → Extract names\n\n3. ⚡ SPEED MATTERS:\n   - Try to answer from search snippets when possible\n   - Only use fetch_webpage as backup\n   - Users prefer quick answers over perfect answers\n\n4. ❌ FORBIDDEN:\n   - Listing page titles as content\n   - Saying "visit [website]"\n   - Returning vague descriptions\n\n5. ✅ ALWAYS:\n   - Give specific names/titles from snippets or scraped content\n   - Format: "最新电影：《电影A》《电影B》《电影C》"\n   - Be direct and concise\n\nRemember: Snippets first → fetch only if needed!',
      },
      ...messages,
    ]
  }

  // Get tools if enabled
  let tools
  if (enableMCP) {
    if (isVercel) {
      // Define tools manually for Vercel (no MCP SDK)
      tools = [
        {
          name: 'search_web',
          description: 'Search the web using DuckDuckGo. Returns search results with titles, snippets, and URLs.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'fetch_webpage',
          description: 'Fetch and extract the main content from a webpage. Returns the text content of the page.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              url: {
                type: 'string',
                description: 'The URL to fetch',
              },
              max_length: {
                type: 'number',
                description: 'Maximum content length in characters (default: 5000)',
                default: 5000,
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'summarize_url',
          description: 'Fetch a URL and return a summary. Combines fetching and content extraction.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              url: {
                type: 'string',
                description: 'The URL to summarize',
              },
            },
            required: ['url'],
          },
        },
      ] as any
      // eslint-disable-next-line no-console
      console.log(`[WebSearch] Using ${tools.length} direct tools for this request`)
      // eslint-disable-next-line no-console
      console.log('[WebSearch] Tools:', tools.map((t: any) => t.name).join(', '))
    } else {
      try {
        const mcpManager = getMCPManager()
        if (mcpManager.isConnected()) {
          tools = mcpManager.getAllTools()
          // eslint-disable-next-line no-console
          console.log(`[MCP] Using ${tools.length} tools for this request`)
          // eslint-disable-next-line no-console
          console.log('[MCP] Tools:', tools.map(t => t.name).join(', '))
        } else {
          // eslint-disable-next-line no-console
          console.log('[MCP] Manager not connected, no tools available')
        }
      } catch (error) {
        console.error('[MCP] Error getting tools:', error)
      }
    }
  }

  const initOptions = generatePayload(
    request.headers.get('Authorization') ?? `Bearer ${apiKey}`,
    requestMessageList,
    tools,
  )

  const headers = initOptions.headers

  if (baseUrl) request.headers.forEach((val, key) => (FORWARD_HEADERS.includes(key) || key.startsWith('sec-') || key.startsWith('x-')) && (headers[key] = val))

  if (ua) headers['user-agent'] = ua

  // #vercel-disable-blocks
  if (httpsProxy) initOptions.dispatcher = new ProxyAgent(httpsProxy)
  // #vercel-end

  // When tools are available, use non-streaming to handle tool execution properly
  if (enableMCP && tools && tools.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[MCP] Using non-streaming mode for tool execution')

    // Make non-streaming request
    const nonStreamOptions = generatePayload(
      request.headers.get('Authorization') ?? `Bearer ${apiKey}`,
      requestMessageList,
      tools,
      false, // non-streaming
    )

    const nonStreamHeaders = nonStreamOptions.headers
    if (baseUrl) request.headers.forEach((val, key) => (FORWARD_HEADERS.includes(key) || key.startsWith('sec-') || key.startsWith('x-')) && (nonStreamHeaders[key] = val))
    if (ua) nonStreamHeaders['user-agent'] = ua
    // #vercel-disable-blocks
    if (httpsProxy) nonStreamOptions.dispatcher = new ProxyAgent(httpsProxy)
    // #vercel-end

    let response = await fetch(`${baseUrl}/v1/chat/completions`, nonStreamOptions)

    if (!response.ok)
      return response as unknown as Response

    const data = await response.json() as any
    // eslint-disable-next-line no-console
    console.log('[MCP] Response finish_reason:', data.choices?.[0]?.finish_reason)

    // Check if tools were called
    if (data.choices?.[0]?.finish_reason === 'tool_calls' && data.choices?.[0]?.message?.tool_calls) {
      const toolCalls = data.choices[0].message.tool_calls
      // eslint-disable-next-line no-console
      console.log('[MCP] Tool calls detected:', toolCalls.map((tc: any) => tc.function.name).join(', '))

      // Execute tools
      const toolResults: ChatMessage[] = []

      for (const toolCall of toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments)
          // eslint-disable-next-line no-console
          console.log(`[Tool] Executing ${toolCall.function.name}:`, args)

          let resultText: string

          // Use direct functions on Vercel, MCP on local
          if (isVercel) {
            // Direct function calls for Vercel
            if (toolCall.function.name === 'search_web') {
              const results = await searchWeb(args.query, args.max_results || 10)
              resultText = `Search results for "${args.query}":\n\n${formatSearchResults(results)}`
            } else if (toolCall.function.name === 'fetch_webpage') {
              const content = await fetchWebpage(args.url, args.max_length || 5000)
              resultText = `Content from ${args.url}:\n\n${content}`
            } else if (toolCall.function.name === 'summarize_url') {
              const content = await fetchWebpage(args.url, 3000)
              resultText = `Content from ${args.url} (for summarization):\n\n${content}`
            } else {
              throw new Error(`Unknown tool: ${toolCall.function.name}`)
            }
          } else {
            // MCP for local development
            const mcpManager = getMCPManager()
            const result = await mcpManager.executeTool(toolCall.function.name, args)
            resultText = result.content?.[0]?.text || JSON.stringify(result)
          }

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: resultText,
          })

          // eslint-disable-next-line no-console
          console.log('[Tool] Result preview:', resultText.slice(0, 200))
        } catch (error) {
          console.error('[Tool] Execution error:', error)
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          })
        }
      }

      // Build messages with tool results
      const updatedMessages: ChatMessage[] = [
        ...requestMessageList,
        {
          role: 'assistant',
          content: data.choices[0].message.content || '',
          tool_calls: toolCalls,
        },
        ...toolResults,
      ]

      // eslint-disable-next-line no-console
      console.log('[MCP] Sending', toolResults.length, 'tool results back to OpenAI')

      // Make final streaming request with results
      const finalOptions = generatePayload(
        request.headers.get('Authorization') ?? `Bearer ${apiKey}`,
        updatedMessages,
        tools,
        true, // streaming for final response
      )

      const finalHeaders = finalOptions.headers
      if (baseUrl) request.headers.forEach((val, key) => (FORWARD_HEADERS.includes(key) || key.startsWith('sec-') || key.startsWith('x-')) && (finalHeaders[key] = val))
      if (ua) finalHeaders['user-agent'] = ua
      // #vercel-disable-blocks
      if (httpsProxy) finalOptions.dispatcher = new ProxyAgent(httpsProxy)
      // #vercel-end

      response = await fetch(`${baseUrl}/v1/chat/completions`, finalOptions)
      // eslint-disable-next-line no-console
      console.log('[MCP] Final response status:', response.status, 'ok:', response.ok)
      // eslint-disable-next-line no-console
      console.log('[MCP] Returning streaming response...')
      const streamResponse = parseOpenAIStream(response as unknown as Response)
      // eslint-disable-next-line no-console
      console.log('[MCP] Stream response created')
      return streamResponse
    }

    // No tool calls, convert to streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const text = data.choices[0].message.content || ''
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  // Normal streaming mode without tools
  const response = await fetch(`${baseUrl}/v1/chat/completions`, initOptions).catch((err: Error) => {
    console.error(err)
    return new Response(JSON.stringify({
      error: {
        code: err.name,
        message: err.message,
      },
    }), { status: 500 })
  }) as Response

  return parseOpenAIStream(response)
}
