# Vercel 403 Forbidden Error - DuckDuckGo Blocking

## Problem

**Symptom**: Web search works locally but fails on Vercel with "等待响应中" (waiting for response)

**Root Cause**: DuckDuckGo returns `HTTP 403: Forbidden` when accessed from Vercel's IP addresses.

```
[WebSearch Direct] Search failed: HTTP 403: Forbidden
[Tool] search_web failed after 196ms: Search failed: HTTP 403: Forbidden
```

## Why This Happens

- **Locally**: Your personal IP is not on DuckDuckGo's blocklist ✅
- **Vercel**: Cloud provider IPs are often blocked to prevent automated scraping ❌

This is a common anti-scraping measure by search engines.

## Solutions

### Option 1: Brave Search API (Recommended - Has Free Tier) ⭐

**Pros:**
- 2,000 free searches per month
- Official API (legal, reliable)
- Fast response times
- No IP blocking issues

**Setup:**
1. Sign up: https://brave.com/search/api/
2. Get your API key
3. Update environment variables:
   ```
   BRAVE_SEARCH_API_KEY=your_key_here
   ```
4. Update `webSearchDirect.ts` to use Brave API

**Cost:**
- Free: 2,000 requests/month
- Pro: $3/1,000 requests after free tier

### Option 2: SerpAPI (Most Reliable)

**Pros:**
- Most reliable search API
- Supports Google, Bing, DuckDuckGo, etc.
- Well-documented
- JSON responses

**Setup:**
1. Sign up: https://serpapi.com
2. Get API key
3. Add to Vercel: `SERPAPI_KEY=your_key_here`

**Cost:**
- $50/month for 5,000 searches
- $125/month for 15,000 searches

### Option 3: Use a Proxy Service

**Pros:**
- Can use any scraping target
- Rotates IPs automatically

**Cons:**
- Adds latency (500ms+)
- Costs money ($10-50/month)
- May still get blocked

**Options:**
- ScraperAPI: https://www.scraperapi.com
- Bright Data: https://brightdata.com
- Oxylabs: https://oxylabs.io

### Option 4: Disable Web Search on Vercel (Quick Fix)

**If you just want it working:**

In Vercel Dashboard → Environment Variables:
- Set `ENABLE_MCP=false` for Production
- Keep `ENABLE_MCP=true` for local development

**Result:**
- ✅ Local development: Web search works
- ❌ Production: No web search, but chat works normally

## Recommended Implementation: Brave Search API

### Step 1: Get API Key

1. Go to https://brave.com/search/api/
2. Sign up and get your API key

### Step 2: Add to Vercel

Vercel Dashboard → Settings → Environment Variables:
```
BRAVE_SEARCH_API_KEY=your_key_here
```

### Step 3: Update Code

Create `src/utils/braveSearch.ts`:

```typescript
import axios from 'axios'

interface BraveSearchResult {
  title: string
  url: string
  description: string
}

export async function braveSearch(query: string, count: number = 10): Promise<BraveSearchResult[]> {
  const apiKey = import.meta.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY
  
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY not configured')
  }

  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    params: {
      q: query,
      count,
    },
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
    timeout: 5000,
  })

  return response.data.web?.results?.map((r: any) => ({
    title: r.title,
    url: r.url,
    description: r.description,
  })) || []
}
```

### Step 4: Update `webSearchDirect.ts`

Add fallback logic:

```typescript
export async function searchWeb(query: string, maxResults: number = 10): Promise<SearchResult[]> {
  // Try Brave Search API first if key is available
  const braveKey = import.meta.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY
  
  if (braveKey) {
    try {
      const results = await braveSearch(query, maxResults)
      return results.map(r => ({
        title: r.title,
        snippet: r.description,
        url: r.url,
      }))
    } catch (error) {
      console.error('[Brave Search] Failed, falling back to DuckDuckGo:', error)
    }
  }
  
  // Fallback to DuckDuckGo (works locally)
  // ... existing DuckDuckGo code ...
}
```

## Testing

1. **Local** (should use DuckDuckGo):
   ```bash
   npm run dev
   # Ask: "search latest ai news"
   # Should work
   ```

2. **Vercel** (will use Brave API):
   ```bash
   git push
   # Wait for deployment
   # Ask: "search latest ai news"
   # Should work!
   ```

## Cost Comparison

| Solution | Free Tier | Paid Cost | Reliability |
|----------|-----------|-----------|-------------|
| DuckDuckGo scraping | Unlimited | Free | ❌ Blocked on Vercel |
| Brave Search API | 2,000/month | $3/1,000 | ✅ Excellent |
| SerpAPI | 100/month | $50/5,000 | ✅ Best |
| Proxy Service | None | $10-50/month | ⚠️ Variable |

## Recommendation

**For hobby projects:** Use Brave Search API (2,000 free/month is generous)
**For production:** Use SerpAPI ($50/month for reliability)

---

Would you like me to implement the Brave Search API solution?

