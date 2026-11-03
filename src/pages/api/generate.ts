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
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const apiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY || process.env.HTTPS_PROXY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL || process.env.OPENAI_API_BASE_URL) || 'https://api.deepseek.com').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD || process.env.SITE_PASSWORD
const ua = import.meta.env.UNDICI_UA || process.env.UNDICI_UA
const enableMCP = import.meta.env.ENABLE_MCP === 'true' || process.env.ENABLE_MCP === 'true'
const isVercel = !!import.meta.env.VERCEL || process.env.VERCEL === '1'

// Debug logging for Vercel
if (isVercel) {
  // eslint-disable-next-line no-console
  console.log('[Vercel] Detected Vercel environment')
  // eslint-disable-next-line no-console
  console.log('[Vercel] ENABLE_MCP (import.meta.env):', import.meta.env.ENABLE_MCP)
  // eslint-disable-next-line no-console
  console.log('[Vercel] ENABLE_MCP (process.env):', process.env.ENABLE_MCP)
  // eslint-disable-next-line no-console
  console.log('[Vercel] ENABLE_MCP (final):', enableMCP)
  // eslint-disable-next-line no-console
  console.log('[Vercel] Has OpenAI Key:', !!(import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY))
}

const FORWARD_HEADERS = ['origin', 'referer', 'cookie', 'user-agent', 'via']

const DATETIME_TOOL: Tool = {
  name: 'get_current_datetime',
  description: 'Get the current date and time. Prefer the date already given in the system message for simple "what day is it" questions.',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA timezone name. Defaults to Asia/Shanghai.',
      },
    },
  },
}

const DIRECT_SEARCH_TOOLS: Tool[] = [
  DATETIME_TOOL,
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
    description: 'Fetch and extract the main content from a webpage. Returns the text content of the page. Do not use this to look up the current date.',
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
]

function getBeijingDateTime(): { iso: string, display: string } {
  const now = new Date()
  const display = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)
  return { iso: now.toISOString(), display }
}

function buildMcpSystemPrompt(userSystem?: string): string {
  const { display } = getBeijingDateTime()
  const prompt = `You are a helpful AI assistant with web search tools.

Current date and time (Beijing, Asia/Shanghai): ${display}

For questions about today's date, current time, or weekday: answer DIRECTLY using the date above. Do NOT fetch websites or search the web for the current date. You already know it.

For movies/news/events and other real-time facts:
- Use search_web first and answer from snippets when they contain enough information
- Only use fetch_webpage if snippets are empty or too vague
- Give specific names/titles. Be direct and concise. Do not tell the user to visit a website.

If a tool fails, try a different tool or answer with what you already know. Never say you cannot get the current date.`

  return userSystem ? `${prompt}\n\n${userSystem}` : prompt
}

function applyForwardHeaders(
  request: Request,
  headers: Record<string, string>,
) {
  if (baseUrl) {
    request.headers.forEach((val, key) => {
      if (FORWARD_HEADERS.includes(key) || key.startsWith('sec-') || key.startsWith('x-'))
        headers[key] = val
    })
  }
  if (ua)
    headers['user-agent'] = ua
}

// Timeout wrapper for tool execution
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

async function executeNamedTool(name: string, args: Record<string, any>): Promise<string> {
  if (name === 'get_current_datetime') {
    const timezone = typeof args.timezone === 'string' && args.timezone ? args.timezone : 'Asia/Shanghai'
    const now = new Date()
    const display = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now)
    return `Current date and time (${timezone}): ${display}\nISO: ${now.toISOString()}`
  }

  if (isVercel) {
    if (name === 'search_web') {
      const results = await searchWeb(args.query, args.max_results || 10)
      // eslint-disable-next-line no-console
      console.log('[Vercel] Search completed, results:', results.length)
      return `Search results for "${args.query}":\n\n${formatSearchResults(results)}`
    }
    if (name === 'fetch_webpage') {
      const content = await fetchWebpage(args.url, args.max_length || 5000)
      // eslint-disable-next-line no-console
      console.log('[Vercel] Fetch completed, length:', content.length)
      return `Content from ${args.url}:\n\n${content}`
    }
    if (name === 'summarize_url') {
      const content = await fetchWebpage(args.url, 3000)
      // eslint-disable-next-line no-console
      console.log('[Vercel] Summarize completed, length:', content.length)
      return `Content from ${args.url} (for summarization):\n\n${content}`
    }
    throw new Error(`Unknown tool: ${name}`)
  }

  const mcpManager = getMCPManager()
  const result = await mcpManager.executeTool(name, args)
  return result.content?.[0]?.text || JSON.stringify(result)
}

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

  let requestMessageList = messages
  if (enableMCP) {
    const existingSystem = messages[0]?.role === 'system' ? messages[0].content : ''
    const rest = messages[0]?.role === 'system' ? messages.slice(1) : messages
    requestMessageList = [
      { role: 'system', content: buildMcpSystemPrompt(existingSystem) },
      ...rest,
    ]
  }

  // Get tools if enabled
  let tools: Tool[] | undefined
  if (enableMCP) {
    if (isVercel) {
      tools = DIRECT_SEARCH_TOOLS
      // eslint-disable-next-line no-console
      console.log(`[WebSearch] Using ${tools.length} direct tools for this request`)
      // eslint-disable-next-line no-console
      console.log('[WebSearch] Tools:', tools.map(t => t.name).join(', '))
    } else {
      try {
        const mcpManager = getMCPManager()
        if (mcpManager.isConnected()) {
          tools = [DATETIME_TOOL, ...mcpManager.getAllTools()]
          // eslint-disable-next-line no-console
          console.log(`[MCP] Using ${tools.length} tools for this request`)
          // eslint-disable-next-line no-console
          console.log('[MCP] Tools:', tools.map(t => t.name).join(', '))
        } else {
          tools = [DATETIME_TOOL]
          // eslint-disable-next-line no-console
          console.log('[MCP] Manager not connected, using built-in datetime tool only')
        }
      } catch (error) {
        console.error('[MCP] Error getting tools:', error)
        tools = [DATETIME_TOOL]
      }
    }
  }

  const authorization = request.headers.get('Authorization') ?? `Bearer ${apiKey}`

  const buildOptions = (msgs: ChatMessage[], withTools: boolean, stream: boolean) => {
    const options = generatePayload(authorization, msgs, withTools ? tools : undefined, stream)
    applyForwardHeaders(request, options.headers)
    // #vercel-disable-blocks
    if (httpsProxy) options.dispatcher = new ProxyAgent(httpsProxy)
    // #vercel-end
    return options
  }

  // When tools are available, use non-streaming to handle tool execution properly
  if (enableMCP && tools && tools.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[MCP] Using non-streaming mode for tool execution')

    let currentMessages: ChatMessage[] = requestMessageList
    const maxRounds = 3

    for (let round = 0; round < maxRounds; round++) {
      const nonStreamOptions = buildOptions(currentMessages, true, false)
      const response = await fetch(`${baseUrl}/v1/chat/completions`, nonStreamOptions)

      if (!response.ok)
        return response as unknown as Response

      const data = await response.json() as any
      const finishReason = data.choices?.[0]?.finish_reason
      const toolCalls = data.choices?.[0]?.message?.tool_calls
      // eslint-disable-next-line no-console
      console.log('[MCP] Response finish_reason:', finishReason)

      if (finishReason !== 'tool_calls' || !toolCalls?.length) {
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

      // eslint-disable-next-line no-console
      console.log('[MCP] Tool calls detected:', toolCalls.map((tc: any) => tc.function.name).join(', '))

      const toolResults: ChatMessage[] = []
      for (const toolCall of toolCalls) {
        const startTime = Date.now()
        try {
          const rawArgs = toolCall.function.arguments
          const args = rawArgs ? JSON.parse(rawArgs) : {}
          // eslint-disable-next-line no-console
          console.log(`[Tool] Executing ${toolCall.function.name}:`, args)

          const timeoutMs = isVercel ? 7000 : 10000
          const resultText = await withTimeout(
            executeNamedTool(toolCall.function.name, args),
            timeoutMs,
            toolCall.function.name,
          )

          const duration = Date.now() - startTime
          // eslint-disable-next-line no-console
          console.log(`[Tool] ${toolCall.function.name} completed in ${duration}ms`)

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: resultText,
          })

          // eslint-disable-next-line no-console
          console.log('[Tool] Result preview:', resultText.slice(0, 200))
        } catch (error) {
          const duration = Date.now() - startTime
          const errorMsg = error instanceof Error ? error.message : String(error)
          console.error(`[Tool] ${toolCall.function.name} failed after ${duration}ms:`, errorMsg)

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: `Error: ${errorMsg}`,
          })
        }
      }

      currentMessages = [
        ...currentMessages,
        {
          role: 'assistant',
          content: data.choices[0].message.content || '',
          tool_calls: toolCalls,
        },
        ...toolResults,
      ]

      // eslint-disable-next-line no-console
      console.log('[MCP] Sending', toolResults.length, 'tool results back to OpenAI')
    }

    // Final answer without tools so the model cannot stall on another tool call
    const finalOptions = buildOptions(currentMessages, false, true)
    const finalResponse = await fetch(`${baseUrl}/v1/chat/completions`, finalOptions)
    // eslint-disable-next-line no-console
    console.log('[MCP] Final response status:', finalResponse.status, 'ok:', finalResponse.ok)
    return parseOpenAIStream(finalResponse as unknown as Response)
  }

  // Normal streaming mode without tools
  const initOptions = buildOptions(requestMessageList, false, true)
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
