/**
 * AUREV Edge Agent Framework
 * 
 * Lightweight agents executing locally with offline capability
 * Enables resilience & latency reduction
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface EdgeAgent {
  id: string
  orgId: string
  nodeId?: string
  agentName: string
  agentType: string
  agentVersion: string
  status: 'draft' | 'training' | 'active' | 'paused' | 'deprecated'
  autonomyLevel: number // 0-100%
  globalModelId?: string
  localModelHash?: string
  totalDecisions: number
  decisionsToday: number
  humanOverrides: number
  accuracyRate?: number
  offlineCapable: boolean
  deployedAt?: Date
  lastDecisionAt?: Date
  config: Record<string, any>
}

export interface AgentDecision {
  agentId: string
  decisionType: string
  input: Record<string, any>
  output: Record<string, any>
  confidence: number
  humanOverride?: boolean
  timestamp: Date
}

/**
 * Edge Agent Framework
 */
export class EdgeAgentFramework {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  
  /**
   * Create or update edge agent
   */
  async createAgent(
    orgId: string,
    agentName: string,
    agentType: string,
    config?: Record<string, any>,
    nodeId?: string
  ): Promise<EdgeAgent> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .insert({
        org_id: orgId,
        node_id: nodeId || null,
        agent_name: agentName,
        agent_type: agentType,
        agent_version: '1.0.0',
        status: 'draft',
        autonomy_level: 85,
        offline_capable: true,
        config: config || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to create agent: ${error.message}`)
    }
    
    return this.mapToEdgeAgent(data)
  }
  
  /**
   * Deploy agent (activate it)
   */
  async deployAgent(agentId: string): Promise<void> {
    const { error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .update({
        status: 'active',
        deployed_at: new Date().toISOString(),
      })
      .eq('id', agentId)
    
    if (error) {
      throw new Error(`Failed to deploy agent: ${error.message}`)
    }
  }
  
  /**
   * Record agent decision
   */
  async recordDecision(
    agentId: string,
    decisionType: string,
    input: Record<string, any>,
    output: Record<string, any>,
    confidence: number,
    humanOverride: boolean = false
  ): Promise<void> {
    // Update agent metrics
    const update: any = {
      total_decisions: const supabase = await this.getSupabase()
    const supabase.raw('total_decisions + 1'),
      decisions_today: const supabase = await this.getSupabase()
    const supabase.raw('decisions_today + 1'),
      last_decision_at: new Date().toISOString(),
    }
    
    if (humanOverride) {
      update.human_overrides = const supabase = await this.getSupabase()
    const supabase.raw('human_overrides + 1')
    }
    
    // Calculate autonomy level
    const { data: agent } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .select('total_decisions, human_overrides')
      .eq('id', agentId)
      .single()
    
    if (agent) {
      const totalDecisions = (agent.total_decisions || 0) + 1
      const humanOverrides = agent.human_overrides || 0
      const autonomy = ((totalDecisions - humanOverrides) / totalDecisions) * 100
      update.autonomy_level = Math.max(0, Math.min(100, autonomy))
    }
    
    await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .update(update)
      .eq('id', agentId)
  }
  
  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<EdgeAgent | null> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .select('*')
      .eq('id', agentId)
      .single()
    
    if (error || !data) {
      return null
    }
    
    return this.mapToEdgeAgent(data)
  }
  
  /**
   * Get all agents for organization
   */
  async getOrgAgents(orgId: string): Promise<EdgeAgent[]> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    
    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`)
    }
    
    return (data || []).map(this.mapToEdgeAgent)
  }
  
  /**
   * Get active agents count
   */
  async getActiveAgentsCount(orgId?: string): Promise<number> {
    let query = const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    
    if (orgId) {
      query = query.eq('org_id', orgId)
    }
    
    const { count, error } = await query
    
    if (error) {
      throw new Error(`Failed to count agents: ${error.message}`)
    }
    
    return count || 0
  }
  
  /**
   * Sync agent model from global model
   */
  async syncAgentModel(
    agentId: string,
    globalModelId: string,
    localModelHash: string
  ): Promise<void> {
    const { error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_edge_agents')
      .update({
        global_model_id: globalModelId,
        local_model_hash: localModelHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId)
    
    if (error) {
      throw new Error(`Failed to sync agent model: ${error.message}`)
    }
  }
  
  /**
   * Map database record to EdgeAgent
   */
  private mapToEdgeAgent(record: any): EdgeAgent {
    return {
      id: record.id,
      orgId: record.org_id,
      nodeId: record.node_id,
      agentName: record.agent_name,
      agentType: record.agent_type,
      agentVersion: record.agent_version,
      status: record.status,
      autonomyLevel: record.autonomy_level || 0,
      globalModelId: record.global_model_id,
      localModelHash: record.local_model_hash,
      totalDecisions: record.total_decisions || 0,
      decisionsToday: record.decisions_today || 0,
      humanOverrides: record.human_overrides || 0,
      accuracyRate: record.accuracy_rate ? parseFloat(record.accuracy_rate.toString()) : undefined,
      offlineCapable: record.offline_capable || false,
      deployedAt: record.deployed_at ? new Date(record.deployed_at) : undefined,
      lastDecisionAt: record.last_decision_at ? new Date(record.last_decision_at) : undefined,
      config: record.config || {},
    }
  }
}

