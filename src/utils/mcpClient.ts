import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

/**
 * MCP Client Manager
 * Handles connections to MCP servers and tool execution
 */
export class MCPClientManager {
  private clients: Map<string, Client> = new Map()
  private tools: Map<string, { client: Client, tool: Tool }> = new Map()

  /**
   * Connect to an MCP server
   */
  async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: {
          ...process.env,
          ...config.env,
          // Pass the current working directory so the server knows the context
          MCP_CLIENT_CWD: process.cwd(),
        },
      })

      const client = new Client(
        {
          name: 'kiwichat-client',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        },
      )

      await client.connect(transport)
      this.clients.set(name, client)

      // Fetch and register tools from this server
      const toolsList = await client.listTools()
      if (toolsList.tools) {
        for (const tool of toolsList.tools)
          this.tools.set(tool.name, { client, tool })
      }

      // eslint-disable-next-line no-console
      console.log(`[MCP] Connected to server: ${name}`)
      // eslint-disable-next-line no-console
      console.log(`[MCP] Registered ${toolsList.tools?.length || 0} tools`)
    } catch (error) {
      console.error(`[MCP] Failed to connect to server ${name}:`, error)
      throw error
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).map(({ tool }) => tool)
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    const toolData = this.tools.get(toolName)
    if (!toolData)
      throw new Error(`Tool not found: ${toolName}`)

    const { client, tool } = toolData

    try {
      // eslint-disable-next-line no-console
      console.log(`[MCP] Executing tool: ${toolName}`, args)
      const result = await client.callTool({ name: tool.name, arguments: args })
      // eslint-disable-next-line no-console
      console.log('[MCP] Tool result:', result)
      return result
    } catch (error) {
      console.error(`[MCP] Tool execution failed for ${toolName}:`, error)
      throw error
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close()
        // eslint-disable-next-line no-console
        console.log(`[MCP] Disconnected from server: ${name}`)
      } catch (error) {
        console.error(`[MCP] Error disconnecting from ${name}:`, error)
      }
    }
    this.clients.clear()
    this.tools.clear()
  }

  /**
   * Check if any servers are connected
   */
  isConnected(): boolean {
    return this.clients.size > 0
  }

  /**
   * Get connected server names
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys())
  }
}

// Singleton instance
let mcpManager: MCPClientManager | null = null

/**
 * Get or create the MCP client manager instance
 */
export function getMCPManager(): MCPClientManager {
  if (!mcpManager)
    mcpManager = new MCPClientManager()

  return mcpManager
}

/**
 * Initialize MCP servers from environment configuration
 */
export async function initializeMCPServers(): Promise<void> {
  const manager = getMCPManager()

  // Get MCP server configurations from environment
  const mcpServersEnv = import.meta.env.MCP_SERVERS

  if (!mcpServersEnv) {
    // eslint-disable-next-line no-console
    console.log('[MCP] No MCP_SERVERS configured')
    return
  }

  try {
    const servers = JSON.parse(mcpServersEnv) as Record<string, MCPServerConfig>

    for (const [name, config] of Object.entries(servers)) {
      try {
        await manager.connectServer(name, config)
      } catch (error) {
        console.error(`[MCP] Failed to initialize server ${name}:`, error)
      }
    }
  } catch (error) {
    console.error('[MCP] Failed to parse MCP_SERVERS configuration:', error)
  }
}
