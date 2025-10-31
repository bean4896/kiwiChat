# 🚨 VERCEL WEB SEARCH NOT WORKING - FIX GUIDE

## The code is correct! The issue is likely environment variables.

### ✅ STEP 1: Verify Environment Variables

Go to your Vercel dashboard:
```
https://vercel.com/[your-username]/kiwi-chat/settings/environment-variables
```

**Required Variables:**

1. `ENABLE_MCP` = `true` ⬅️ **MUST BE EXACTLY THIS**
2. `OPENAI_API_KEY` = `sk-...`

**IMPORTANT:** 
- Make sure there are NO spaces before/after `true`
- Make sure it's lowercase `true`, not `True` or `TRUE`
- Make sure it applies to **Production**, **Preview**, and **Development**

### ✅ STEP 2: Redeploy

After adding/fixing environment variables:

```bash
# Option A: Manual redeploy on Vercel
Go to: Deployments → Click "..." → Redeploy

# Option B: Push a new commit
git add .
git commit -m "test: trigger redeploy" --allow-empty
git push
```

### ✅ STEP 3: Verify Deployment

Visit this URL (replace with your actual URL):
```
https://your-app.vercel.app/api/debug
```

**Expected output:**
```json
{
  "isVercel": true,
  "enableMCP": true,  ⬅️ This MUST be true
  "hasOpenAIKey": true,
  "mode": "Direct WebSearch Functions",
  "nodeVersion": "v20.x.x",
  "cwd": "/var/task"
}
```

If `enableMCP` is `false`, the environment variable is not set correctly!

### ✅ STEP 4: Test Web Search

After verification, test on your Vercel site:
- Ask: "今天是哪天"
- Should fetch from timeanddate.com and give exact date

### 🐛 Still Not Working?

Share these outputs:

1. **Debug endpoint JSON** (from Step 3)
2. **Vercel Function Logs**:
   - Go to: Deployments → Latest → Functions
   - Ask "今天是哪天" on your site
   - Copy all logs from the "render" function
3. **Browser Network Tab**:
   - F12 → Network tab
   - Ask question
   - Click "/api/generate" request
   - Copy the response

---

## Common Issues

### Issue: `enableMCP: false` in debug output
**Fix:** Environment variable not set. Add `ENABLE_MCP=true` on Vercel.

### Issue: No logs appear in Functions tab
**Fix:** Your request might be timing out. Check browser console for errors.

### Issue: AI doesn't use tools
**Fix:** Check if tools are defined in the logs:
```
[WebSearch] Using 3 direct tools for this request
[WebSearch] Tools: search_web, fetch_webpage, summarize_url
```

If you don't see this, share the full logs!

