#!/usr/bin/env node
/**
 * MCP File System Server Entry Point
 * This script starts the file system MCP server
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Define the allowed operations directory (for security)
// Use MCP_FS_BASE_PATH from environment, or fallback to current working directory
const ALLOWED_BASE_PATH = process.env.MCP_FS_BASE_PATH || process.cwd()

// Debug logging
console.error(`[MCP FS Server] ALLOWED_BASE_PATH: ${ALLOWED_BASE_PATH}`)
console.error(`[MCP FS Server] Current working directory: ${process.cwd()}`)
console.error(`[MCP FS Server] Script directory: ${__dirname}`)

/**
 * Validate that a path is within the allowed base path
 */
function validatePath(filePath) {
  // Get the client's working directory context
  const clientCwd = process.env.MCP_CLIENT_CWD || process.cwd()
  
  let resolvedPath
  if (path.isAbsolute(filePath)) {
    resolvedPath = path.resolve(filePath)
  } else {
    // Relative paths are resolved from the client's working directory
    resolvedPath = path.resolve(clientCwd, filePath)
  }
  
  // Normalize both paths for comparison
  const normalizedBase = path.normalize(ALLOWED_BASE_PATH)
  const normalizedPath = path.normalize(resolvedPath)
  
  console.error(`[MCP FS] Validating: ${filePath}`)
  console.error(`[MCP FS] Client CWD: ${clientCwd}`)
  console.error(`[MCP FS] Resolved to: ${normalizedPath}`)
  console.error(`[MCP FS] Base path: ${normalizedBase}`)
  
  if (!normalizedPath.startsWith(normalizedBase)) {
    console.error(`[MCP FS] Access denied: ${normalizedPath} is outside ${normalizedBase}`)
    throw new Error('Access denied: Path is outside allowed directory')
  }
  
  console.error(`[MCP FS] Access granted: ${normalizedPath}`)
  return resolvedPath
}

/**
 * Create and start the file system MCP server
 */
async function startFileSystemMCPServer() {
  const server = new Server(
    {
      name: 'filesystem-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Register available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'read_file',
          description: 'Read the contents of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to the file to read (relative to base directory)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write content to a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to the file to write (relative to base directory)',
              },
              content: {
                type: 'string',
                description: 'The content to write to the file',
              },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'list_directory',
          description: 'List files and directories in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to the directory to list (relative to base directory)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'create_directory',
          description: 'Create a new directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to the directory to create (relative to base directory)',
              },
            },
            required: ['path'],
          },
        },
      ],
    }
  })

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case 'read_file': {
          const filePath = validatePath(args.path)
          const content = await fs.readFile(filePath, 'utf-8')
          return {
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
          }
        }

        case 'write_file': {
          const filePath = validatePath(args.path)
          const content = args.content
          await fs.writeFile(filePath, content, 'utf-8')
          return {
            content: [
              {
                type: 'text',
                text: `Successfully wrote to ${args.path}`,
              },
            ],
          }
        }

        case 'list_directory': {
          const dirPath = validatePath(args.path)
          const entries = await fs.readdir(dirPath, { withFileTypes: true })
          const formatted = entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
          }))
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formatted, null, 2),
              },
            ],
          }
        }

        case 'create_directory': {
          const dirPath = validatePath(args.path)
          await fs.mkdir(dirPath, { recursive: true })
          return {
            content: [
              {
                type: 'text',
                text: `Successfully created directory ${args.path}`,
              },
            ],
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    } catch (error) {
      const errorMessage = error.message || 'Unknown error'
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      }
    }
  })

  // Start the server
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[MCP FS Server] File system MCP server started. Base path: ${ALLOWED_BASE_PATH}`)
}

// Start the server
startFileSystemMCPServer().catch((error) => {
  console.error('[MCP FS Server] Failed to start:', error)
  process.exit(1)
})

