/**
 * Simple test endpoint to verify streaming works on Vercel
 * Visit: /api/test-stream
 */
import type { APIRoute } from 'astro'

export const GET: APIRoute = async() => {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    start(controller) {
      // Send test message character by character
      const message = 'Hello from Vercel streaming! This is a test.'
      let index = 0
      
      const interval = setInterval(() => {
        if (index < message.length) {
          controller.enqueue(encoder.encode(message[index]))
          index++
        } else {
          clearInterval(interval)
          controller.close()
        }
      }, 50) // 50ms per character
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

