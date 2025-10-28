# MCP Deployment Limitations

## Important: MCP is LOCAL ONLY

### Why MCP doesn't work on Vercel for desktop file access:

1. **Serverless Environment**
   - Vercel runs your app on **cloud servers**, not your local computer
   - When you visit the website, the MCP file system runs on Vercel's servers
   - It can only access Vercel's temporary filesystem, NOT your desktop

2. **Architecture Diagram**

```
LOCAL DEPLOYMENT (Works ✅):
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser    │─────▶│  Local Server│─────▶│ Your Desktop │
│              │      │  (localhost)  │      │  Files       │
└──────────────┘      └──────────────┘      └──────────────┘
                            MCP ✅

VERCEL DEPLOYMENT (Doesn't Work ❌):
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser    │─────▶│Vercel Cloud  │─────▶│ Vercel Temp  │
│              │      │  Servers      │      │  Storage ❌  │
└──────────────┘      └──────────────┘      └──────────────┘
                                                  NOT your desktop!
```

3. **Security & Privacy**
   - Web apps CAN'T directly access your local files for security reasons
   - This is by design to protect users

## Solutions

### Option 1: Use MCP Locally (Recommended)
Run the app on your computer:
```bash
npm run dev
# Visit http://localhost:4321
# MCP will access YOUR desktop files ✅
```

### Option 2: Download Feature in Browser
If you want to save chat summaries from Vercel deployment:
- Add a "Download Chat" button in the UI
- Use browser's native download API
- Files download to your Downloads folder

### Option 3: Hybrid Approach
- Use Vercel for public access (no MCP)
- Run locally when you need MCP features
- Set `ENABLE_MCP=false` on Vercel

## What DOES work on Vercel?
- ✅ Regular chat functionality
- ✅ OpenAI API integration
- ✅ All UI features
- ❌ MCP file system tools
- ❌ Accessing your local desktop

## Recommendation
For your use case (saving chat summaries to desktop):
1. Keep MCP enabled for local development
2. Add a "Download Summary" button for Vercel deployment
3. Users can then save the downloaded file wherever they want

