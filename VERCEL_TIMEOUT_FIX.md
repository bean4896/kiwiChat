# Vercel Timeout Fix Summary

## Problem
- Web search works locally but hangs/keeps loading on Vercel production
- User asks "search latest ai news" → infinite loading

## Root Causes Identified

### 1. Missing Environment Variable
- **Issue**: `ENABLE_MCP` was set on Vercel but read as `false`
- **Cause**: Code only checked `import.meta.env.ENABLE_MCP` (build-time), but Vercel uses `process.env.ENABLE_MCP` (runtime)
- **Fix**: Now checks both sources

### 2. No Timeout Protection
- **Issue**: If axios request or tool execution hangs, entire request freezes
- **Cause**: No timeout wrapper around tool execution
- **Fix**: Added `withTimeout()` wrapper with 12s limit per tool

### 3. Insufficient Error Handling
- **Issue**: Timeout errors weren't caught or logged properly
- **Cause**: Generic error handling without timeout-specific messages
- **Fix**: Added detailed error messages and execution duration logging

## Changes Made

### File: `src/pages/api/generate.ts`

1. **Environment Variable Reading** (Lines 12-17)
```typescript
// Before
const enableMCP = import.meta.env.ENABLE_MCP === 'true'

// After
const enableMCP = import.meta.env.ENABLE_MCP === 'true' || process.env.ENABLE_MCP === 'true'
```

2. **Timeout Wrapper** (Lines 36-44)
```typescript
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}
```

3. **Tool Execution with Timeout** (Lines 234-270)
- Wrap each tool call with 12s timeout
- Track execution duration
- Log completion time or failure reason

### File: `src/utils/webSearchDirect.ts`

1. **Increased Axios Timeout**
- Before: 8000ms
- After: 10000ms

2. **Added HTTP Status Validation**
```typescript
if (response.status !== 200) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`)
}
```

3. **Better Timeout Error Messages**
```typescript
if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
  throw new Error('Search request timed out. Please try again.')
}
```

### File: `src/pages/api/debug.ts`

Added diagnostic info:
```typescript
envSource: {
  ENABLE_MCP_import: import.meta.env.ENABLE_MCP,
  ENABLE_MCP_process: process.env.ENABLE_MCP,
}
```

## How to Verify the Fix

### 1. Check Environment Variables
Visit: `https://your-app.vercel.app/api/debug`

Expected output:
```json
{
  "configuration": {
    "enableMCP": true,
    "envSource": {
      "ENABLE_MCP_import": undefined,
      "ENABLE_MCP_process": "true"
    }
  },
  "tools": {
    "expectedTools": ["search_web", "fetch_webpage", "summarize_url"]
  }
}
```

### 2. Test Web Search
Ask: "search latest ai news"

**Expected behavior:**
- Should complete within 12s
- OR show timeout error with clear message

### 3. Check Vercel Function Logs
Go to: Vercel Dashboard → Deployments → Latest → Functions

Look for:
```
[Tool] Executing search_web: { query: 'latest ai news' }
[Vercel] Using direct function for: search_web
[WebSearch Direct] Searching for: "latest ai news"
[WebSearch Direct] Found X results
[Vercel] Search completed, results: X
[Tool] search_web completed in XXXms
```

If timeout occurs:
```
[Tool] search_web failed after 12000ms: search_web timed out after 12000ms
```

## Timeout Hierarchy

```
Vercel Function Timeout (10-60s depending on plan)
  └─> Tool Execution Timeout (12s)
      └─> Axios Request Timeout (10s)
          └─> Network Request
```

## Troubleshooting

### Still seeing infinite loading?

1. **Check environment variable is actually set:**
   - Go to Vercel → Settings → Environment Variables
   - Confirm `ENABLE_MCP=true` exists
   - Apply to Production, Preview, Development

2. **Check Function Logs:**
   - Should see: `[Vercel] ENABLE_MCP (process.env): true`
   - If not, environment variable not loaded

3. **Check timeout is working:**
   - Should see execution duration in logs
   - If request hangs > 12s, something else is wrong

4. **Check Vercel Plan Limits:**
   - Hobby: 10s function timeout
   - Pro: 60s function timeout
   - Our tool timeout: 12s (fits hobby plan)

### DuckDuckGo blocking requests?

If you see HTTP 403 or similar:
- DuckDuckGo may be rate-limiting Vercel's IP
- Try using different search API (e.g., SerpAPI, Brave Search)
- Or implement request caching

## Alternative Solutions

If timeouts persist:

1. **Use a dedicated search API** (SerpAPI, Brave Search API)
   - More reliable
   - Better rate limits
   - Structured data

2. **Implement caching** (Redis, Vercel KV)
   - Cache search results for 5-10 minutes
   - Reduce external API calls

3. **Use background jobs** (Vercel Cron, Queue)
   - Pre-fetch common queries
   - Return cached results immediately

## Monitoring

Add these checks to your monitoring:
1. Function execution time
2. Tool success rate
3. Timeout occurrence rate
4. Error types and frequency

Use Vercel Analytics or add custom logging to track these metrics.

---

## Summary

**Before:**
- ❌ Environment variable not read
- ❌ No timeout protection
- ❌ Infinite hanging possible
- ❌ No execution tracking

**After:**
- ✅ Reads from both env sources
- ✅ 12s timeout per tool
- ✅ 10s axios timeout
- ✅ Detailed error messages
- ✅ Execution duration logging
- ✅ Clear timeout errors

The fix ensures that even if a request fails, the user gets a response within 12 seconds instead of infinite loading!

