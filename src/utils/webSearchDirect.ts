/**
 * Direct Web Search Functions (Vercel-compatible)
 * No MCP SDK, no child processes - just plain async functions
 */

import axios from 'axios'
import * as cheerio from 'cheerio'
import { braveSearchWeb } from './braveSearch'

export interface SearchResult {
  title: string
  snippet: string
  url: string
}

/**
 * Search web (uses Brave API if available, falls back to DuckDuckGo)
 */
export async function searchWeb(query: string, maxResults: number = 10): Promise<SearchResult[]> {
  // Try Brave Search API first if key is available
  const braveKey = import.meta.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY

  if (braveKey) {
    try {
      // eslint-disable-next-line no-console
      console.log('[WebSearch] Using Brave Search API')
      const results = await braveSearchWeb(query, maxResults)
      return results.map(r => ({
        title: r.title,
        snippet: r.description,
        url: r.url,
      }))
    }
    catch (error) {
      console.error('[WebSearch] Brave Search failed, falling back to DuckDuckGo:', error)
      // Fall through to DuckDuckGo
    }
  }

  // Fallback to DuckDuckGo (works locally, blocked on Vercel)
  try {
    // eslint-disable-next-line no-console
    console.log(`[WebSearch Direct] Using DuckDuckGo for: "${query}"`)

    const response = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 5000, // Reduced to 5s for Vercel 10s limit
      validateStatus: () => true, // Accept any status code
    })

    // Check response status
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const $ = cheerio.load(response.data)
    const results: SearchResult[] = []

    $('.result__body').each((i, elem) => {
      if (i >= maxResults)
        return false

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

    // eslint-disable-next-line no-console
    console.log(`[WebSearch Direct] Found ${results.length} results`)
    return results
  }
  catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[WebSearch Direct] Search failed:', errorMsg)

    // Return a more helpful error for timeouts
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      throw new Error('Search request timed out. Please try again.')
    }

    throw new Error(`Search failed: ${errorMsg}`)
  }
}

/**
 * Fetch and extract content from a webpage
 */
export async function fetchWebpage(url: string, maxLength: number = 5000): Promise<string> {
  try {
    // eslint-disable-next-line no-console
    console.log(`[WebSearch Direct] Fetching: ${url}`)
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 5000, // Reduced to 5s for Vercel 10s limit
      maxContentLength: 1024 * 1024 * 5, // 5MB limit
      validateStatus: () => true, // Accept any status code
    })

    // Check response status
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

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

    // eslint-disable-next-line no-console
    console.log(`[WebSearch Direct] Fetched ${content.length} characters`)
    return content
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[WebSearch Direct] Fetch failed:', errorMsg)
    
    // Return a more helpful error for timeouts
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      throw new Error('Fetch request timed out. The website may be slow or unavailable.')
    }
    
    throw new Error(`Failed to fetch webpage: ${errorMsg}`)
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

