#!/usr/bin/env node
/**
 * Standalone Web Search MCP Server
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
        description: 'Search the web using DuckDuckGo. Returns search results with titles, snippets, and URLs. Use this to find current information, news, or answers to questions.',
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
        description: 'Fetch and extract the main content from a webpage. Returns the text content of the page. Use this to read articles, documentation, or any web page.',
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
        description: 'Fetch a URL and return content for summarization. Use this when a user asks you to summarize a webpage or article.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch and summarize',
            },
          },
          required: ['url'],
        },
      },
    ],
  }
})

// Search DuckDuckGo
async function searchDuckDuckGo(query, maxResults = 5) {
  try {
    // Use DuckDuckGo's HTML search
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    })

    const $ = cheerio.load(response.data)
    const results = []

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
    throw new Error(`Search failed: ${error.message}`)
  }
}

// Fetch webpage content
async function fetchWebpage(url, maxLength = 5000) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
      maxContentLength: 1024 * 1024 * 5, // 5MB limit
    })

    const $ = cheerio.load(response.data)

    // Remove script and style elements
    $('script, style, nav, header, footer, aside, .advertisement').remove()

    // Try to find main content
    let content = ''
    const selectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post-content', '.article-content']
    
    for (const selector of selectors) {
      const text = $(selector).first().text().trim()
      if (text.length > 200) {
        content = text
        break
      }
    }

    // Fallback to body if no main content found
    if (!content) {
      content = $('body').text().trim()
    }

    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').slice(0, maxLength)

    if (!content || content.length < 50) {
      throw new Error('No substantial content found on page')
    }

    return content
  } catch (error) {
    throw new Error(`Failed to fetch webpage: ${error.message}`)
  }
}

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'search_web': {
        const query = args.query
        const maxResults = args.max_results || 5

        console.error(`[WebSearch] Searching for: "${query}"`)
        const results = await searchDuckDuckGo(query, maxResults)

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No search results found. Try different search terms.',
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

        console.error(`[WebSearch] Found ${results.length} results`)
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
        const url = args.url
        const maxLength = args.max_length || 5000

        console.error(`[WebSearch] Fetching: ${url}`)
        const content = await fetchWebpage(url, maxLength)

        console.error(`[WebSearch] Fetched ${content.length} characters`)
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
        const url = args.url

        console.error(`[WebSearch] Fetching for summary: ${url}`)
        const content = await fetchWebpage(url, 3000)

        console.error(`[WebSearch] Content ready for summarization`)
        return {
          content: [
            {
              type: 'text',
              text: `Content from ${url} (please provide a concise summary):\n\n${content}`,
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    console.error(`[WebSearch] Error: ${error.message}`)
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
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
  console.error('Web Search MCP Server running on stdio')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})

