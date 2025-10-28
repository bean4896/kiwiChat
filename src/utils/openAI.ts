import { createParser } from 'eventsource-parser'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'
import type { RequestInit } from 'undici'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const model = import.meta.env.OPENAI_API_MODEL || 'gpt-3.5-turbo-16k'
const temperature = parseFloat(import.meta.env.OPENAI_API_TEMPERATURE) || 1

/**
 * Convert MCP tools to OpenAI function format
 */
export function convertMCPToolsToOpenAIFunctions(mcpTools: Tool[]): any[] {
  return mcpTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}

export interface GeneratePayloadOptions {
  authorization: string
  messages: ChatMessage[]
  tools?: Tool[]
  tool_choice?: 'auto' | 'none' | { type: 'function', function: { name: string } }
}

export const generatePayload = (
  authorization: string,
  messages: ChatMessage[],
  tools?: Tool[],
  stream = true,
): RequestInit & { headers: Record<string, string> } => {
  const payload: any = {
    model,
    messages,
    temperature,
    stream,
  }

  // Add tools if provided
  if (tools && tools.length > 0) {
    payload.tools = convertMCPToolsToOpenAIFunctions(tools)
    payload.tool_choice = 'auto'
  }

  return {
    headers: { 'Content-Type': 'application/json', authorization },
    method: 'POST',
    body: JSON.stringify(payload),
  }
}

export const parseOpenAIStream = (rawResponse: Response) => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const headers = Object.fromEntries(rawResponse.headers)
  delete headers['content-encoding']
  // Keep content-type for proper streaming
  headers['content-type'] = 'text/event-stream'

  const initOptions = {
    status: rawResponse.status,
    statusText: rawResponse.statusText,
    headers,
  }

  if (!rawResponse.ok) return new Response(rawResponse.body, initOptions)

  const stream = new ReadableStream({
    async start(controller) {
      const toolCallsBuffer: any[] = []
      let currentToolCall: any = null

      const streamParser = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.close()
            return
          }
          try {
            const json = JSON.parse(data)
            const delta = json.choices[0].delta

            // Handle tool calls
            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (toolCall.index !== undefined) {
                  if (!currentToolCall || currentToolCall.index !== toolCall.index) {
                    if (currentToolCall)
                      toolCallsBuffer.push(currentToolCall)

                    currentToolCall = {
                      index: toolCall.index,
                      id: toolCall.id || '',
                      type: toolCall.type || 'function',
                      function: {
                        name: toolCall.function?.name || '',
                        arguments: toolCall.function?.arguments || '',
                      },
                    }
                  } else {
                    // Append to existing tool call
                    if (toolCall.function?.arguments)
                      currentToolCall.function.arguments += toolCall.function.arguments

                    if (toolCall.function?.name)
                      currentToolCall.function.name += toolCall.function.name
                  }
                }
              }
            }

            // Handle regular content
            const text = delta?.content || ''
            if (text) {
              const queue = encoder.encode(text)
              controller.enqueue(queue)
            }
          } catch (e) {
            console.error(e)
            console.error(data)
          }
        }
      }

      const parser = createParser(streamParser)
      for await (const chunk of rawResponse.body as any)
        parser.feed(decoder.decode(chunk))
    },
  })

  return new Response(stream, initOptions)
}
