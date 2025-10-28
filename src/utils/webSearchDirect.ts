/**
 * Direct Web Search Functions (Vercel-compatible)
 * No MCP SDK, no child processes - just plain async functions
 */

import axios from 'axios'
import * as cheerio from 'cheerio'

export interface SearchResult {
  title: string
  snippet: string
  url: string
}

/**
 * Search DuckDuckGo and return results
 */
export async function searchWeb(query: string, maxResults: number = 10): Promise<SearchResult[]> {
  try {
    console.log(`[WebSearch Direct] Searching for: "${query}"`)
    
    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 8000,
    })

    const $ = cheerio.load(response.data)
    const results: SearchResult[] = []

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

    console.log(`[WebSearch Direct] Found ${results.length} results`)
    return results
  } catch (error) {
    console.error('[WebSearch Direct] Search failed:', error)
    throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Fetch and extract content from a webpage
 */
export async function fetchWebpage(url: string, maxLength: number = 5000): Promise<string> {
  try {
    console.log(`[WebSearch Direct] Fetching: ${url}`)
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 8000,
      maxContentLength: 1024 * 1024 * 5, // 5MB limit
    })

    const $ = cheerio.load(response.data)

    // Remove unnecessary elements
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
    if (!content)
      content = $('body').text().trim()

    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').slice(0, maxLength)

    if (!content || content.length < 50)
      throw new Error('No substantial content found on page')

    console.log(`[WebSearch Direct] Fetched ${content.length} characters`)
    return content
  } catch (error) {
    console.error('[WebSearch Direct] Fetch failed:', error)
    throw new Error(`Failed to fetch webpage: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Format search results for OpenAI
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0)
    return 'No search results found.'

  return results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`)
    .join('\n\n')
}

