/**
 * Web Search MCP Server
 * Provides web search and URL fetching capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import axios from 'axios'
import * as cheerio from 'cheerio'

const server = new Server(
  {
    name: 'web-search-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_web',
        description: 'Search the web using DuckDuckGo. Returns search results with titles, snippets, and URLs.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results to return (default: 5)',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'fetch_webpage',
        description: 'Fetch and extract the main content from a webpage. Returns the text content of the page.',
        inputSchema: {
          type: 'object',
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
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to summarize',
            },
          },
          required: ['url'],
        },
      },
    ],
  }
})

// Search DuckDuckGo
async function searchDuckDuckGo(query: string, maxResults: number = 5): Promise<any[]> {
  try {
    // Use DuckDuckGo's HTML search
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    })

    const $ = cheerio.load(response.data)
    const results: any[] = []

    $('.result__body').each((i, elem) => {
      if (i >= maxResults) return false

      const $elem = $(elem)
      const title = $elem.find('.result__title').text().trim()
      const snippet = $elem.find('.result__snippet').text().trim()
      const url = $elem.find('.result__url').attr('href') || ''

      if (title && url) {
        results.push({
          title,
          snippet,
          url: url.startsWith('//') ? `https:${url}` : url,
        })
      }
      return true
    })

    return results
  } catch (error) {
    throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Fetch webpage content
async function fetchWebpage(url: string, maxLength: number = 5000): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
      maxContentLength: 1024 * 1024 * 5, // 5MB limit
    })

    const $ = cheerio.load(response.data)

    // Remove script and style elements
    $('script, style, nav, header, footer, aside').remove()

    // Extract main content
    const content = $('main, article, .content, #content, body')
      .first()
      .text()
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, maxLength)

    if (!content) {
      throw new Error('No content found on page')
    }

    return content
  } catch (error) {
    throw new Error(`Failed to fetch webpage: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'search_web': {
        const query = args.query as string
        const maxResults = (args.max_results as number) || 5

        const results = await searchDuckDuckGo(query, maxResults)

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No search results found.',
              },
            ],
          }
        }

        const formattedResults = results
          .map(
            (r, i) =>
              `${i + 1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`,
          )
          .join('\n\n')

        return {
          content: [
            {
              type: 'text',
              text: `Search results for "${query}":\n\n${formattedResults}`,
            },
          ],
        }
      }

      case 'fetch_webpage': {
        const url = args.url as string
        const maxLength = (args.max_length as number) || 5000

        const content = await fetchWebpage(url, maxLength)

        return {
          content: [
            {
              type: 'text',
              text: `Content from ${url}:\n\n${content}`,
            },
          ],
        }
      }

      case 'summarize_url': {
        const url = args.url as string

        const content = await fetchWebpage(url, 3000)

        return {
          content: [
            {
              type: 'text',
              text: `Content from ${url} (for summarization):\n\n${content}`,
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
})

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // eslint-disable-next-line no-console
  console.error('Web Search MCP Server running on stdio')
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', error)
  process.exit(1)
})

