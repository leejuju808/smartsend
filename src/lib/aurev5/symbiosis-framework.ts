/**
 * AUREV Protocol v5 - Human-AI Symbiosis Framework
 * 
 * Implements:
 * - Cognitive Companions
 * - Collective Councils
 * - Global Synthesis Grid
 * - Ethical Alignment Core
 */

import { getServerSupabase } from '@/lib/supabase/server'
import { getProtocolEngine } from './protocol-engine'

export interface CognitiveCompanion {
  id: string
  humanNodeId: string
  aiNodeId: string
  companionRole: 'assistant' | 'advisor' | 'collaborator' | 'autonomous'
  sharedMemoryEnabled: boolean
  reasoningExtension: boolean
  interactionsCount: number
  decisionsAssisted: number
  valueEarnedMicro: number
  trustScore: number
  synergyScore: number
  status: 'active' | 'paused' | 'terminated'
}

export interface CollectiveCouncil {
  id: string
  councilName: string
  councilType: 'founders' | 'pricing' | 'governance' | 'custom'
  description?: string
  participantNodes: string[]
  participantCount: number
  decisionPower: number
  consensusThreshold: number
  decisionsMade: number
  averageDecisionTimeSeconds?: number
  status: 'active' | 'paused' | 'dissolved'
}

export interface SynthesisInsight {
  id: string
  synthesisType: 'insight' | 'prediction' | 'knowledge' | 'state'
  domain?: string
  aggregatedInsight: Record<string, any>
  confidenceScore: number
  verificationCount: number
  contributingNodes: string[]
  contributionCount: number
  isGlobalState: boolean
  synthesizedAt: Date
}

export interface EthicalFeedback {
  id: string
  humanNodeId: string
  aiNodeId?: string
  feedbackType: 'alignment' | 'bias' | 'goal_drift' | 'safety' | 'custom'
  feedbackContent: Record<string, any>
  severity: 'low' | 'medium' | 'high' | 'critical'
  resolved: boolean
  resolutionAction?: string
}

/**
 * Human-AI Symbiosis Framework Engine
 */
export class SymbiosisFramework {
  private supabase = getServerSupabase()
  private protocol = getProtocolEngine()
  
  // =====================================================
  // COGNITIVE COMPANIONS
  // =====================================================
  
  /**
   * Create a cognitive companion (link human + AI)
   */
  async createCompanion(
    humanNodeId: string,
    aiNodeId: string,
    options: {
      companionRole?: CognitiveCompanion['companionRole']
      sharedMemoryEnabled?: boolean
      reasoningExtension?: boolean
      metadata?: Record<string, any>
    } = {}
  ): Promise<CognitiveCompanion> {
    const { data, error } = await this.supabase
      .from('aurev5_companions')
      .insert({
        human_node_id: humanNodeId,
        ai_node_id: aiNodeId,
        companion_role: options.companionRole || 'assistant',
        shared_memory_enabled: options.sharedMemoryEnabled ?? true,
        reasoning_extension: options.reasoningExtension ?? true,
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to create companion: ${error.message}`)
    }
    
    return this.mapToCompanion(data)
  }
  
  /**
   * Get companion by human node
   */
  async getCompanion(humanNodeId: string): Promise<CognitiveCompanion | null> {
    const { data, error } = await this.supabase
      .from('aurev5_companions')
      .select('*')
      .eq('human_node_id', humanNodeId)
      .eq('status', 'active')
      .single()
    
    if (error || !data) {
      return null
    }
    
    return this.mapToCompanion(data)
  }
  
  /**
   * Record companion interaction
   */
  async recordInteraction(
    companionId: string,
    interactionType: string,
    context: Record<string, any>
  ): Promise<void> {
    const { data: companion } = await this.supabase
      .from('aurev5_companions')
      .select('interactions_count')
      .eq('id', companionId)
      .single()
    
    if (companion) {
      await this.supabase
        .from('aurev5_companions')
        .update({
          interactions_count: (companion.interactions_count || 0) + 1,
        })
        .eq('id', companionId)
    }
    
    // Update trust score based on interaction quality
    const companion = await this.getCompanionById(companionId)
    if (companion) {
      const trustDelta = context.success ? 2 : -1
      await this.protocol.updateTrustScore(
        companion.humanNodeId,
        companion.aiNodeId,
        interactionType,
        trustDelta
      )
    }
  }
  
  /**
   * Assist in decision-making (companion helps human)
   */
  async assistDecision(
    companionId: string,
    decisionContext: Record<string, any>,
    aiRecommendation: Record<string, any>
  ): Promise<void> {
    const { data: companion } = await this.supabase
      .from('aurev5_companions')
      .select('decisions_assisted')
      .eq('id', companionId)
      .single()
    
    if (companion) {
      await this.supabase
        .from('aurev5_companions')
        .update({
          decisions_assisted: (companion.decisions_assisted || 0) + 1,
        })
        .eq('id', companionId)
    }
  }
  
  // =====================================================
  // COLLECTIVE COUNCILS
  // =====================================================
  
  /**
   * Create a collective council
   */
  async createCouncil(
    councilName: string,
    councilType: CollectiveCouncil['councilType'],
    participantNodeIds: string[],
    options: {
      description?: string
      decisionPower?: number
      consensusThreshold?: number
      metadata?: Record<string, any>
    } = {}
  ): Promise<CollectiveCouncil> {
    const { data, error } = await this.supabase
      .from('aurev5_councils')
      .insert({
        council_name: councilName,
        council_type: councilType,
        description: options.description,
        participant_nodes: participantNodeIds,
        participant_count: participantNodeIds.length,
        decision_power: options.decisionPower || 0,
        consensus_threshold: options.consensusThreshold || 75,
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to create council: ${error.message}`)
    }
    
    return this.mapToCouncil(data)
  }
  
  /**
   * Make a council decision (consensus process)
   */
  async makeCouncilDecision(
    councilId: string,
    decisionProposal: Record<string, any>,
    votes: Array<{ nodeId: string; vote: 'for' | 'against' | 'abstain'; reasoning?: string }>
  ): Promise<{
    passed: boolean
    consensusLevel: number
    decisionTime: number
  }> {
    const startTime = Date.now()
    
    const council = await this.getCouncilById(councilId)
    if (!council) {
      throw new Error('Council not found')
    }
    
    const votesFor = votes.filter(v => v.vote === 'for').length
    const votesAgainst = votes.filter(v => v.vote === 'against').length
    const votesAbstain = votes.filter(v => v.vote === 'abstain').length
    const totalVotes = votes.length
    
    const consensusLevel = totalVotes > 0
      ? (votesFor / totalVotes) * 100
      : 0
    
    const passed = consensusLevel >= council.consensusThreshold
    
    const decisionTime = (Date.now() - startTime) / 1000 // seconds
    
    // Update council metrics
    await this.supabase
      .from('aurev5_councils')
      .update({
        decisions_made: (council.decisionsMade || 0) + 1,
        average_decision_time_seconds: council.averageDecisionTimeSeconds
          ? ((council.averageDecisionTimeSeconds + decisionTime) / 2)
          : decisionTime,
      })
      .eq('id', councilId)
    
    return {
      passed,
      consensusLevel,
      decisionTime,
    }
  }
  
  // =====================================================
  // GLOBAL SYNTHESIS GRID
  // =====================================================
  
  /**
   * Synthesize insights from multiple nodes
   */
  async synthesizeInsight(
    synthesisType: SynthesisInsight['synthesisType'],
    contributingNodeIds: string[],
    contributions: Array<{
      nodeId: string
      contribution: Record<string, any>
      confidence?: number
    }>,
    options: {
      domain?: string
      expiresAt?: Date
      metadata?: Record<string, any>
    } = {}
  ): Promise<SynthesisInsight> {
    // Aggregate contributions
    const aggregatedInsight = this.aggregateContributions(contributions)
    
    // Calculate confidence score
    const confidenceScores = contributions
      .map(c => c.confidence || 50)
      .filter(c => c > 0)
    const avgConfidence = confidenceScores.length > 0
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
      : 50
    
    const { data, error } = await this.supabase
      .from('aurev5_synthesis')
      .insert({
        synthesis_type: synthesisType,
        domain: options.domain,
        aggregated_insight: aggregatedInsight,
        confidence_score: avgConfidence,
        verification_count: contributingNodeIds.length,
        contributing_nodes: contributingNodeIds,
        contribution_count: contributions.length,
        is_global_state: false,
        expires_at: options.expiresAt?.toISOString(),
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to synthesize insight: ${error.message}`)
    }
    
    return this.mapToSynthesis(data)
  }
  
  /**
   * Mark synthesis as global state
   */
  async setGlobalState(synthesisId: string): Promise<void> {
    // Unset all other global states of the same type
    const { data: synthesis } = await this.supabase
      .from('aurev5_synthesis')
      .select('synthesis_type')
      .eq('id', synthesisId)
      .single()
    
    if (synthesis) {
      await this.supabase
        .from('aurev5_synthesis')
        .update({ is_global_state: false })
        .eq('synthesis_type', synthesis.synthesis_type)
        .eq('is_global_state', true)
      
      await this.supabase
        .from('aurev5_synthesis')
        .update({ 
          is_global_state: true,
          status: 'active',
        })
        .eq('id', synthesisId)
    }
  }
  
  /**
   * Get current global state for a domain
   */
  async getGlobalState(
    synthesisType: SynthesisInsight['synthesisType'],
    domain?: string
  ): Promise<SynthesisInsight | null> {
    let query = this.supabase
      .from('aurev5_synthesis')
      .select('*')
      .eq('synthesis_type', synthesisType)
      .eq('is_global_state', true)
      .eq('status', 'active')
      .order('synthesized_at', { ascending: false })
      .limit(1)
    
    if (domain) {
      query = query.eq('domain', domain)
    }
    
    const { data, error } = await query.single()
    
    if (error || !data) {
      return null
    }
    
    return this.mapToSynthesis(data)
  }
  
  // =====================================================
  // ETHICAL ALIGNMENT CORE
  // =====================================================
  
  /**
   * Submit ethical feedback
   */
  async submitEthicalFeedback(
    humanNodeId: string,
    feedbackType: EthicalFeedback['feedbackType'],
    feedbackContent: Record<string, any>,
    options: {
      aiNodeId?: string
      severity?: EthicalFeedback['severity']
      metadata?: Record<string, any>
    } = {}
  ): Promise<EthicalFeedback> {
    const { data, error } = await this.supabase
      .from('aurev5_ethical_feedback')
      .insert({
        human_node_id: humanNodeId,
        ai_node_id: options.aiNodeId || null,
        feedback_type: feedbackType,
        feedback_content: feedbackContent,
        severity: options.severity || 'medium',
        metadata: options.metadata || {},
        resolved: false,
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to submit ethical feedback: ${error.message}`)
    }
    
    return this.mapToEthicalFeedback(data)
  }
  
  /**
   * Resolve ethical feedback
   */
  async resolveEthicalFeedback(
    feedbackId: string,
    resolutionAction: string,
    modelUpdated: boolean = false,
    modelVersion?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('aurev5_ethical_feedback')
      .update({
        resolved: true,
        resolution_action: resolutionAction,
        resolution_timestamp: new Date().toISOString(),
        ai_model_updated: modelUpdated,
        model_version: modelVersion || null,
      })
      .eq('id', feedbackId)
    
    if (error) {
      throw new Error(`Failed to resolve ethical feedback: ${error.message}`)
    }
  }
  
  // =====================================================
  // HELPER METHODS
  // =====================================================
  
  private async getCompanionById(id: string): Promise<CognitiveCompanion | null> {
    const { data } = await this.supabase
      .from('aurev5_companions')
      .select('*')
      .eq('id', id)
      .single()
    
    return data ? this.mapToCompanion(data) : null
  }
  
  private async getCouncilById(id: string): Promise<CollectiveCouncil | null> {
    const { data } = await this.supabase
      .from('aurev5_councils')
      .select('*')
      .eq('id', id)
      .single()
    
    return data ? this.mapToCouncil(data) : null
  }
  
  private aggregateContributions(contributions: Array<{ contribution: Record<string, any> }>): Record<string, any> {
    // Simple aggregation: merge all contributions
    // In production, use more sophisticated merging (weighted, conflict resolution, etc.)
    const aggregated: Record<string, any> = {}
    
    for (const { contribution } of contributions) {
      Object.assign(aggregated, contribution)
    }
    
    return aggregated
  }
  
  private mapToCompanion(data: any): CognitiveCompanion {
    return {
      id: data.id,
      humanNodeId: data.human_node_id,
      aiNodeId: data.ai_node_id,
      companionRole: data.companion_role,
      sharedMemoryEnabled: data.shared_memory_enabled,
      reasoningExtension: data.reasoning_extension,
      interactionsCount: Number(data.interactions_count || 0),
      decisionsAssisted: Number(data.decisions_assisted || 0),
      valueEarnedMicro: Number(data.value_earned_micro || 0),
      trustScore: Number(data.trust_score || 50),
      synergyScore: Number(data.synergy_score || 0),
      status: data.status,
    }
  }
  
  private mapToCouncil(data: any): CollectiveCouncil {
    return {
      id: data.id,
      councilName: data.council_name,
      councilType: data.council_type,
      description: data.description,
      participantNodes: data.participant_nodes || [],
      participantCount: Number(data.participant_count || 0),
      decisionPower: Number(data.decision_power || 0),
      consensusThreshold: Number(data.consensus_threshold || 75),
      decisionsMade: Number(data.decisions_made || 0),
      averageDecisionTimeSeconds: data.average_decision_time_seconds 
        ? Number(data.average_decision_time_seconds)
        : undefined,
      status: data.status,
    }
  }
  
  private mapToSynthesis(data: any): SynthesisInsight {
    return {
      id: data.id,
      synthesisType: data.synthesis_type,
      domain: data.domain,
      aggregatedInsight: data.aggregated_insight,
      confidenceScore: Number(data.confidence_score || 0),
      verificationCount: Number(data.verification_count || 0),
      contributingNodes: data.contributing_nodes || [],
      contributionCount: Number(data.contribution_count || 0),
      isGlobalState: data.is_global_state || false,
      synthesizedAt: new Date(data.synthesized_at),
    }
  }
  
  private mapToEthicalFeedback(data: any): EthicalFeedback {
    return {
      id: data.id,
      humanNodeId: data.human_node_id,
      aiNodeId: data.ai_node_id,
      feedbackType: data.feedback_type,
      feedbackContent: data.feedback_content,
      severity: data.severity,
      resolved: data.resolved || false,
      resolutionAction: data.resolution_action,
    }
  }
}

// Singleton instance
let symbiosisInstance: SymbiosisFramework | null = null

export function getSymbiosisFramework(): SymbiosisFramework {
  if (!symbiosisInstance) {
    symbiosisInstance = new SymbiosisFramework()
  }
  return symbiosisInstance
}

