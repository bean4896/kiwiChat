/**
 * MCP Initialization Module
 * Initializes MCP servers when the app starts
 */
import { getMCPManager } from './mcpClient'

let isInitialized = false

/**
 * Initialize MCP servers
 * This should be called once during app startup
 */
export async function initializeMCP(): Promise<void> {
  if (isInitialized) {
    console.log('[MCP] Already initialized')
    return
  }

  const enableMCP = import.meta.env.ENABLE_MCP === 'true'
  if (!enableMCP) {
    console.log('[MCP] MCP is disabled (set ENABLE_MCP=true to enable)')
    return
  }

  console.log('[MCP] Initializing MCP servers...')
  const manager = getMCPManager()

  try {
    // Get MCP server configurations from environment
    const mcpServersEnv = import.meta.env.MCP_SERVERS

    if (!mcpServersEnv) {
      console.log('[MCP] No MCP_SERVERS configured, skipping initialization')
      return
    }

    let servers = JSON.parse(mcpServersEnv)
    
    // Replace {{PROJECT_ROOT}} placeholder with actual project directory
    const projectRoot = process.cwd()
    servers = JSON.parse(
      JSON.stringify(servers).replace(/\{\{PROJECT_ROOT\}\}/g, projectRoot)
    )
    
    console.log(`[MCP] Using project root: ${projectRoot}`)

    // Connect to each configured server
    for (const [name, config] of Object.entries(servers)) {
      try {
        await manager.connectServer(name, config as any)
        console.log(`[MCP] Successfully connected to server: ${name}`)
      } catch (error) {
        console.error(`[MCP] Failed to connect to server ${name}:`, error)
      }
    }

    const connectedServers = manager.getConnectedServers()
    const tools = manager.getAllTools()
    
    console.log(`[MCP] Initialization complete`)
    console.log(`[MCP] Connected servers: ${connectedServers.join(', ')}`)
    console.log(`[MCP] Available tools: ${tools.map(t => t.name).join(', ')}`)
    
    isInitialized = true
  } catch (error) {
    console.error('[MCP] Failed to initialize MCP:', error)
  }
}

/**
 * Check if MCP is initialized and ready
 */
export function isMCPReady(): boolean {
  return isInitialized && getMCPManager().isConnected()
}

