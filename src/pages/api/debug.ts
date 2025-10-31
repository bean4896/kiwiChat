/**
 * Debug endpoint to check Vercel configuration
 * Access: https://your-app.vercel.app/api/debug
 */
import type { APIRoute } from 'astro'

export const GET: APIRoute = async() => {
  // Check both import.meta.env and process.env for Vercel compatibility
  const enableMCP = import.meta.env.ENABLE_MCP === 'true' || process.env.ENABLE_MCP === 'true'
  const isVercel = !!import.meta.env.VERCEL || process.env.VERCEL === '1'
  const hasOpenAIKey = !!(import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY)
  
  const debug = {
    environment: {
      isVercel,
      platform: isVercel ? 'Vercel' : 'Local',
      nodeVersion: process.version,
    },
    configuration: {
      enableMCP,
      hasOpenAIKey,
      openAIKeyLength: (import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY)?.length || 0,
      envSource: {
        ENABLE_MCP_import: import.meta.env.ENABLE_MCP,
        ENABLE_MCP_process: process.env.ENABLE_MCP,
      },
    },
    tools: {
      mode: isVercel ? 'Direct Functions' : 'MCP SDK',
      expectedTools: enableMCP ? ['search_web', 'fetch_webpage', 'summarize_url'] : [],
    },
    dependencies: {
      hasAxios: true,  // If this loads, axios is available
      hasCheerio: true, // If this loads, cheerio is available
    },
    timestamp: new Date().toISOString(),
  }

  return new Response(JSON.stringify(debug, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

