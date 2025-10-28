/**
 * Simple File System MCP Server
 * Provides basic file operations as MCP tools
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import path from 'path'

// Define the allowed operations directory (for security)
const ALLOWED_BASE_PATH = process.env.MCP_FS_BASE_PATH || process.cwd()

/**
 * Validate that a path is within the allowed base path
 */
function validatePath(filePath: string): string {
  const resolvedPath = path.resolve(ALLOWED_BASE_PATH, filePath)
  if (!resolvedPath.startsWith(ALLOWED_BASE_PATH)) {
    throw new Error('Access denied: Path is outside allowed directory')
  }
  return resolvedPath
}

/**
 * Create and start the file system MCP server
 */
export async function startFileSystemMCPServer(): Promise<void> {
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
                description: 'The path to the file to read',
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
                description: 'The path to the file to write',
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
                description: 'The path to the directory to list',
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
                description: 'The path to the directory to create',
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
          const filePath = validatePath(args.path as string)
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
          const filePath = validatePath(args.path as string)
          const content = args.content as string
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
          const dirPath = validatePath(args.path as string)
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
          const dirPath = validatePath(args.path as string)
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
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
  console.error('[MCP FS Server] File system MCP server started')
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startFileSystemMCPServer().catch((error) => {
    console.error('[MCP FS Server] Failed to start:', error)
    process.exit(1)
  })
}

