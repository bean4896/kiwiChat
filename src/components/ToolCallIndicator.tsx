import { Show } from 'solid-js'
import type { ToolCall } from '@/types'

interface Props {
  toolCalls: ToolCall[]
}

/**
 * Component to display tool calls in the chat
 */
export default function ToolCallIndicator(props: Props) {
  return (
    <Show when={props.toolCalls && props.toolCalls.length > 0}>
      <div class="tool-calls-container my-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div class="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
          🔧 Using Tools:
        </div>
        {props.toolCalls.map((toolCall) => {
          const args = JSON.parse(toolCall.function.arguments)
          return (
            <div class="tool-call-item mb-2 last:mb-0">
              <div class="font-mono text-xs text-blue-600 dark:text-blue-400">
                {toolCall.function.name}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 ml-4">
                {Object.entries(args).map(([key, value]) => (
                  <div>
                    <span class="font-semibold">{key}:</span>{' '}
                    <span class="font-mono">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Show>
  )
}

