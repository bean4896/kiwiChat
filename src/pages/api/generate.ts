// #vercel-disable-blocks
import { ProxyAgent, fetch } from 'undici'
// #vercel-end
import { generatePayload, parseOpenAIStream } from '@/utils/openAI'
import { verifySignature } from '@/utils/auth'
import { getMCPManager } from '@/utils/mcpClient'
import { initializeMCP } from '@/utils/mcpInit'
import type { APIRoute } from 'astro'
import type { ChatMessage } from '@/types'

const apiKey = import.meta.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD
const ua = import.meta.env.UNDICI_UA
const enableMCP = import.meta.env.ENABLE_MCP === 'true'

const FORWARD_HEADERS = ['origin', 'referer', 'cookie', 'user-agent', 'via']

// Initialize MCP on first request
let mcpInitPromise: Promise<void> | null = null
if (enableMCP && !mcpInitPromise)
  mcpInitPromise = initializeMCP()

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

  // Use messages as-is (system role is handled by frontend)
  const requestMessageList = messages

  // Get MCP tools if enabled
  let tools
  if (enableMCP) {
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
      // eslint-disable-next-line no-console
      console.error('[MCP] Error getting tools:', error)
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
      const mcpManager = getMCPManager()
      const toolResults: ChatMessage[] = []

      for (const toolCall of toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments)
          // eslint-disable-next-line no-console
          console.log(`[MCP] Executing ${toolCall.function.name}:`, args)

          const result = await mcpManager.executeTool(toolCall.function.name, args)
          const resultText = result.content?.[0]?.text || JSON.stringify(result)

          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: resultText,
          })

          // eslint-disable-next-line no-console
          console.log('[MCP] Result preview:', resultText.slice(0, 200))
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[MCP] Execution error:', error)
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
      return parseOpenAIStream(response as unknown as Response)
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
    // eslint-disable-next-line no-console
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
