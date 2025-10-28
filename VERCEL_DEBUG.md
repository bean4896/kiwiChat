# Vercel Web Search Debugging Guide

## Quick Diagnosis

### Step 1: Check Debug Endpoint

Visit: `https://your-app.vercel.app/api/debug`

Expected output:
```json
{
  "environment": {
    "isVercel": true,  // ← Should be true
    "platform": "Vercel",
    "nodeVersion": "v20.x.x"
  },
  "configuration": {
    "enableMCP": true,  // ← Should be true (check this!)
    "hasOpenAIKey": true,  // ← Should be true
    "openAIKeyLength": 51  // ← Should be > 40
  },
  "tools": {
    "mode": "Direct Functions",  // ← Should be "Direct Functions"
    "expectedTools": ["search_web", "fetch_webpage", "summarize_url"]
  }
}
```

### Step 2: Check Environment Variables

Go to: **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Required variables:
- ✅ `ENABLE_MCP` = `true`
- ✅ `OPENAI_API_KEY` = `sk-...` (your actual key)

### Step 3: Check Function Logs

1. Go to: **Vercel Dashboard** → **Deployments** → **Latest Deployment** → **Functions**
2. Click on the serverless function
3. Check the **Realtime Logs**

When you ask a question, you should see:
```
[Vercel] Detected Vercel environment
[Vercel] ENABLE_MCP: true
[Vercel] Has OpenAI Key: true
[WebSearch] Using 3 direct tools for this request
[WebSearch] Tools: search_web, fetch_webpage, summarize_url
[Tool] Executing fetch_webpage: { url: 'https://www.timeanddate.com/' }
[Vercel] Using direct function for: fetch_webpage
[Vercel] Fetch completed, length: 5000
```

## Common Issues & Fixes

### Issue 1: `enableMCP: false` in debug output
**Problem:** Missing environment variable
**Fix:** Add `ENABLE_MCP=true` to Vercel environment variables, redeploy

### Issue 2: `hasOpenAIKey: false` in debug output  
**Problem:** Missing API key
**Fix:** Add `OPENAI_API_KEY` to Vercel environment variables, redeploy

### Issue 3: No logs appear
**Problem:** Function not executing
**Fix:** Check Vercel function logs for build errors

### Issue 4: `axios` or `cheerio` error
**Problem:** Dependency not installed
**Fix:** Check `package.json` has:
```json
{
  "dependencies": {
    "axios": "^1.13.0",
    "cheerio": "^1.1.2"
  }
}
```

### Issue 5: Timeout errors
**Problem:** DuckDuckGo blocked or slow
**Fix:** Already set to 8s timeout (should work)

### Issue 6: Tools not being called
**Problem:** System prompt not working
**Fix:** Check that `/api/generate` is receiving tools correctly

## Testing Commands

After deploying, test with these queries:
1. "今天精准日期" (Should fetch from timeanddate.com)
2. "latest movies" (Should search DuckDuckGo)
3. "What's the weather?" (Should search)

## Contact Info

If none of these work, share with me:
1. Output from `/api/debug`
2. Vercel Function Logs (copy entire log)
3. Environment variable names (not values)

