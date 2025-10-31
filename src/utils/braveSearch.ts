/**
 * Brave Search API integration
 * Official API - no IP blocking issues on Vercel
 */

import axios from 'axios'

export interface BraveSearchResult {
  title: string
  url: string
  description: string
}

/**
 * Search using Brave Search API
 */
export async function braveSearchWeb(query: string, count: number = 10): Promise<BraveSearchResult[]> {
  const apiKey = import.meta.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY

  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY not configured')
  }

  try {
    // eslint-disable-next-line no-console
    console.log(`[Brave Search] Searching for: "${query}"`)

    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: {
        q: query,
        count,
      },
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      timeout: 5000,
    })

    const results = response.data.web?.results || []

    // eslint-disable-next-line no-console
    console.log(`[Brave Search] Found ${results.length} results`)

    return results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
    }))
  }
  catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[Brave Search] Search failed:', errorMsg)
    throw new Error(`Brave Search failed: ${errorMsg}`)
  }
}

