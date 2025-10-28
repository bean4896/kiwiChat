<h1 align="center">KiwiChat</h1>

<div align="center">English | <a href="./README.zh-CN.md">简体中文</a></div>

<br>

> Forked from [chatgpt-demo](https://github.com/anse-app/chatgpt-demo) with **MCP (Model Context Protocol)** integration.

## Features

- 💬 **ChatGPT Interface** - Clean, modern UI for AI conversations
- 🔧 **MCP Integration** - AI can interact with your file system and search the web
- 🔍 **Web Search** - AI can search the internet for real-time information
- 🎨 **Dark/Light Theme** - Toggle between themes
- 📱 **PWA Support** - Install as an app
- 🔒 **Optional Password Protection** - Secure your instance

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example configuration:
```bash
cp env.example.mcp .env
```

Edit `.env` and add your OpenAI API key:
```bash
OPENAI_API_KEY=your-api-key-here
```

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000

## MCP (Model Context Protocol)

This project includes **MCP integration**, allowing the AI to interact with your local file system and search the web.

### Available MCP Tools

#### 📁 File System (Local Development)
- **Read files** - Access and read any file in the project
- **Write files** - Create or modify files
- **List directories** - Browse folder contents
- **Create directories** - Make new folders

#### 🔍 Web Search (Local & Vercel)
- **Search the web** - Find current information using DuckDuckGo
- **Fetch webpages** - Extract content from any URL
- **Summarize URLs** - Get webpage summaries

### Example Prompts

**File System (Local only):**
```
"List all files in this directory"
"Read the package.json file and tell me the project name"
"Create a new file called notes.txt with today's todos"
"Analyze all TypeScript files in src/ and create a summary"
```

**Web Search (Works everywhere):**
```
"What's the latest news about AI?"
"Search for Node.js best practices"
"Summarize this article: https://example.com/article"
"What's the weather in Tokyo today?"
```

### Configuration

MCP is configured via environment variables in your `.env` file:

#### Option 1: File System Only (Local Development)
```bash
ENABLE_MCP=true
MCP_SERVERS={"filesystem":{"command":"node","args":["mcp-filesystem-server.mjs"],"env":{"MCP_FS_BASE_PATH":"{{PROJECT_ROOT}}"}}}
```

#### Option 2: Web Search Only (Works on Vercel ✅)
```bash
ENABLE_MCP=true
MCP_SERVERS={"websearch":{"command":"node","args":["mcp-websearch-server.mjs"]}}
```

#### Option 3: Both File System and Web Search (Recommended for Local)
```bash
ENABLE_MCP=true
MCP_SERVERS={"filesystem":{"command":"node","args":["mcp-filesystem-server.mjs"],"env":{"MCP_FS_BASE_PATH":"{{PROJECT_ROOT}}"}},"websearch":{"command":"node","args":["mcp-websearch-server.mjs"]}}
```

**Note:** `{{PROJECT_ROOT}}` is automatically replaced with your project directory.

### MCP on Vercel Deployment

**Important:** File system tools only work for local development. When deploying to Vercel:

- ❌ **File System** - Won't access user's local files (Vercel runs on cloud servers)
- ✅ **Web Search** - Works perfectly on Vercel for real-time information

**Recommended Vercel Configuration:**
```bash
ENABLE_MCP=true
MCP_SERVERS={"websearch":{"command":"node","args":["mcp-websearch-server.mjs"]}}
```

### Security

- ✅ **File System:** Path validation and no path traversal (local only)
- ✅ **Web Search:** Makes HTTP requests to public websites (works on Vercel)
- ✅ **Explicit Tools:** Each operation must be explicitly defined
- ✅ **Easy to Disable:** Set `ENABLE_MCP=false` to turn off all MCP features

### Expanding Access

By default, MCP can only access the project directory. To allow access to parent directories:

```bash
# Access entire Desktop (if project is on Desktop)
MCP_SERVERS={"filesystem":{"command":"node","args":["mcp-filesystem-server.mjs"],"env":{"MCP_FS_BASE_PATH":"{{PROJECT_ROOT}}/.."}}}

# Custom directory
MCP_SERVERS={"filesystem":{"command":"node","args":["mcp-filesystem-server.mjs"],"env":{"MCP_FS_BASE_PATH":"/path/to/directory"}}}
```

**⚠️ Security Warning:** Only expand access if you trust the operations you're performing.

## Environment Variables

You can control the website through environment variables.

| Name | Description | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Your API Key for OpenAI. | `null` |
| `OPENAI_API_MODEL` | ID of the model to use. [Model endpoint compatibility](https://platform.openai.com/docs/models/model-endpoint-compatibility) | `gpt-3.5-turbo-16k` |
| `OPENAI_API_TEMPERATURE` | Default `temperature` parameter for model. | `1.0` |
| `OPENAI_API_BASE_URL` | Custom base url for OpenAI API. | `https://api.openai.com` |
| `HTTPS_PROXY` | Provide proxy for OpenAI API. | `null` |
| `SITE_PASSWORD` | Set password for site. If not set, site will be public | `null` |
| `PUBLIC_SECRET_KEY` | Secret string for the project. Use for generating signatures for API calls | `null` |
| `ENABLE_MCP` | Enable MCP (Model Context Protocol) features | `false` |
| `MCP_SERVERS` | JSON configuration of MCP servers | `null` |
| `HEAD_SCRIPTS` | Inject analytics or other scripts before `</head>` of the page | `null` |
| `TUTORIAL_MD_URL` | url of the tutorial markdown file | `null` |
| `AD_IFRAME_URL` | url of the advertisement iframe | `null` |
| `UNDICI_UA` | user-agent for backend requests | `(forward)` |
| `PUBLIC_RIGHT_ALIGN_MY_MSG` | whether user messages should be right-aligned | `null` |

## Deployment

### Vercel
```bash
npm run build:vercel
```

### Netlify
```bash
npm run build:netlify
```

### Docker
```bash
docker build -t kiwichat .
docker run -p 3000:3000 -e OPENAI_API_KEY=your-key kiwichat
```

## MCP Resources

- [MCP Official Documentation](https://modelcontextprotocol.io)
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)

## Contributing

This project exists thanks to all those who contributed to [the original project](https://github.com/anse-app/chatgpt-demo).

Thank you to all our supporters!🙏

[![img](https://contributors.nn.ci/api?repo=anse-app/chatgpt-demo)](https://github.com/ddiu8081/chatgpt-demo/graphs/contributors)

## License

MIT © [Muspi Merol](./LICENSE)
