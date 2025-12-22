/**
 * AUREV 3.0 Mesh Protocol
 * 
 * Decentralized update network for AI models
 * Enables zero-downtime learning worldwide
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface MeshNode {
  id: string
  orgId: string
  nodeType: 'smartsend' | 'opsgrid' | 'agentcloud' | 'multi'
  nodeIdentifier: string
  status: 'active' | 'inactive' | 'suspended' | 'syncing'
  meshEndpoint?: string
  lastHeartbeat: Date
  totalAgents: number
  totalDecisionsToday: number
  localModelAccuracy: number
}

export interface MeshUpdate {
  modelName: string
  modelVersion: number
  updateType: 'gradient_push' | 'model_pull' | 'policy_update' | 'node_sync'
  priority: 'low' | 'medium' | 'high' | 'critical'
  payload: Record<string, any>
}

export interface MeshSyncResult {
  success: boolean
  nodesUpdated: number
  errors: Array<{ nodeId: string; error: string }>
  latency: number
}

/**
 * AUREV Mesh Protocol Handler
 */
export class MeshProtocol {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  private readonly SYNC_TIMEOUT_MS = 30000 // 30 seconds
  
  /**
   * Register or update mesh node
   */
  async registerNode(
    orgId: string,
    nodeType: MeshNode['nodeType'],
    nodeIdentifier: string,
    meshEndpoint?: string,
    metadata?: Record<string, any>
  ): Promise<MeshNode> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.rpc('register_mesh_node', {
      p_org_id: orgId,
      p_node_type: nodeType,
      p_node_identifier: nodeIdentifier,
      p_mesh_endpoint: meshEndpoint || null,
      p_metadata: metadata || {},
    })
    
    if (error) {
      throw new Error(`Failed to register node: ${error.message}`)
    }
    
    // Fetch complete node data
    const { data: node, error: fetchError } = await supabase
      .from('aurev_mesh_nodes')
      .select('*')
      .eq('id', data)
      .single()
    
    if (fetchError || !node) {
      throw new Error('Failed to fetch registered node')
    }
    
    return this.mapNodeToMeshNode(node)
  }
  
  /**
   * Send heartbeat from node
   */
  async sendHeartbeat(
    nodeId: string,
    metrics?: {
      totalAgents?: number
      totalDecisionsToday?: number
      localModelAccuracy?: number
    }
  ): Promise<void> {
    const update: any = {
      last_heartbeat: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    if (metrics) {
      if (metrics.totalAgents !== undefined) update.total_agents = metrics.totalAgents
      if (metrics.totalDecisionsToday !== undefined) update.total_decisions_today = metrics.totalDecisionsToday
      if (metrics.localModelAccuracy !== undefined) update.local_model_accuracy = metrics.localModelAccuracy
    }
    
    const supabase = await this.getSupabase()
    const { error } = await supabase
      .from('aurev_mesh_nodes')
      .update(update)
      .eq('id', nodeId)
    
    if (error) {
      throw new Error(`Failed to send heartbeat: ${error.message}`)
    }
  }
  
  /**
   * Broadcast update to all active nodes
   */
  async broadcastUpdate(
    update: MeshUpdate,
    targetNodeTypes?: MeshNode['nodeType'][]
  ): Promise<MeshSyncResult> {
    const startTime = Date.now()
    const errors: MeshSyncResult['errors'] = []
    let nodesUpdated = 0
    
    // Get target nodes
    const supabase = await this.getSupabase()
    let query = supabase
      .from('aurev_mesh_nodes')
      .select('id, org_id, node_type, mesh_endpoint, node_identifier')
      .eq('status', 'active')
    
    if (targetNodeTypes && targetNodeTypes.length > 0) {
      query = query.in('node_type', targetNodeTypes)
    }
    
    const { data: nodes, error } = await query
    
    if (error) {
      throw new Error(`Failed to fetch nodes: ${error.message}`)
    }
    
    if (!nodes || nodes.length === 0) {
      return {
        success: true,
        nodesUpdated: 0,
        errors: [],
        latency: Date.now() - startTime,
      }
    }
    
    // Send update to each node
    const updatePromises = nodes.map(async (node) => {
      try {
        if (!node.mesh_endpoint) {
          // Node doesn't have endpoint, mark as needing sync
          await supabase
            .from('aurev_mesh_nodes')
            .update({ status: 'syncing' })
            .eq('id', node.id)
          return
        }
        
        // Send HTTP request to node endpoint
        const response = await fetch(`${node.mesh_endpoint}/api/mesh/receive-update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AUREV-Mesh-Key': process.env.AUREV_MESH_API_KEY || '',
            'X-AUREV-Node-ID': node.id,
          },
          body: JSON.stringify(update),
          signal: AbortSignal.timeout(this.SYNC_TIMEOUT_MS),
        })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        nodesUpdated++
      } catch (err) {
        errors.push({
          nodeId: node.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
    
    await Promise.allSettled(updatePromises)
    
    return {
      success: errors.length === 0,
      nodesUpdated,
      errors,
      latency: Date.now() - startTime,
    }
  }
  
  /**
   * Get global network statistics
   */
  async getNetworkStats(): Promise<{
    totalNodes: number
    activeNodes: number
    totalAgents: number
    totalDecisionsToday: number
    averageAccuracy: number
    nodeTypes: Record<string, number>
  }> {
    const supabase = await this.getSupabase()
    const { data: nodes, error } = await supabase
      .from('aurev_mesh_nodes')
      .select('status, total_agents, total_decisions_today, local_model_accuracy, node_type')
    
    if (error) {
      throw new Error(`Failed to fetch network stats: ${error.message}`)
    }
    
    const activeNodes = nodes?.filter(n => n.status === 'active') || []
    const totalNodes = nodes?.length || 0
    
    const nodeTypes: Record<string, number> = {}
    let totalAgents = 0
    let totalDecisions = 0
    let accuracySum = 0
    let accuracyCount = 0
    
    nodes?.forEach((node: any) => {
      // Count by type
      nodeTypes[node.node_type] = (nodeTypes[node.node_type] || 0) + 1
      
      // Aggregate metrics
      if (node.status === 'active') {
        totalAgents += node.total_agents || 0
        totalDecisions += node.total_decisions_today || 0
        if (node.local_model_accuracy) {
          accuracySum += parseFloat(node.local_model_accuracy.toString())
          accuracyCount++
        }
      }
    })
    
    return {
      totalNodes,
      activeNodes: activeNodes.length,
      totalAgents,
      totalDecisionsToday: totalDecisions,
      averageAccuracy: accuracyCount > 0 ? accuracySum / accuracyCount : 0,
      nodeTypes,
    }
  }
  
  /**
   * Get node details
   */
  async getNode(nodeId: string): Promise<MeshNode | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('aurev_mesh_nodes')
      .select('*')
      .eq('id', nodeId)
      .single()
    
    if (error || !data) {
      return null
    }
    
    return this.mapNodeToMeshNode(data)
  }
  
  /**
   * Get all nodes for an organization
   */
  async getOrgNodes(orgId: string): Promise<MeshNode[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('aurev_mesh_nodes')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    
    if (error) {
      throw new Error(`Failed to fetch org nodes: ${error.message}`)
    }
    
    return (data || []).map((node: any) => this.mapNodeToMeshNode(node))
  }
  
  /**
   * Map database node to MeshNode format
   */
  private mapNodeToMeshNode(node: any): MeshNode {
    return {
      id: node.id,
      orgId: node.org_id,
      nodeType: node.node_type,
      nodeIdentifier: node.node_identifier,
      status: node.status,
      meshEndpoint: node.mesh_endpoint,
      lastHeartbeat: new Date(node.last_heartbeat),
      totalAgents: node.total_agents || 0,
      totalDecisionsToday: node.total_decisions_today || 0,
      localModelAccuracy: parseFloat(node.local_model_accuracy?.toString() || '0'),
    }
  }
  
  /**
   * Check node health and mark inactive if stale
   */
  async checkNodeHealth(maxStaleMinutes: number = 10): Promise<void> {
    const staleThreshold = new Date(Date.now() - maxStaleMinutes * 60 * 1000)
    const supabase = await this.getSupabase()
    const { error } = await supabase
      .from('aurev_mesh_nodes')
      .update({ status: 'inactive' })
      .eq('status', 'active')
      .lt('last_heartbeat', staleThreshold.toISOString())
    
    if (error) {
      console.error('Failed to check node health:', error)
    }
  }
}

