/**
 * AUREV Protocol v5 - Core Protocol Engine
 * 
 * Civilization Phase: Unified Intelligence Era
 * Layer 0-3 Orchestration
 */

import { getServerSupabase } from '@/lib/supabase/server'
import crypto from 'crypto'

// =====================================================
// TYPES
// =====================================================

export type NodeType = 'human' | 'ai_agent' | 'organization' | 'collective'
export type ClaimType = 'fact' | 'prediction' | 'decision' | 'insight' | 'protocol'
export type TransactionType = 
  | 'poi_reward' 
  | 'knowledge_sale' 
  | 'decision_payment' 
  | 'consensus_reward'
  | 'allocation'
  | 'transfer'
  | 'burn'

export interface AUREVNode {
  id: string
  nodeType: NodeType
  nodeIdentifier: string
  displayName?: string
  description?: string
  cognitiveProfile?: Record<string, any>
  intelligenceScore: number
  verifiedKnowledgeContributions: number
  optimizedDecisionsExecuted: number
  consensusParticipations: number
  status: 'active' | 'suspended' | 'deprecated'
  registeredAt: Date
}

export interface ConsensusClaim {
  id: string
  nodeId: string
  claimType: ClaimType
  claimContent: Record<string, any>
  claimContext?: Record<string, any>
  verificationScore: number
  consensusLevel: number
  participantCount: number
  status: 'pending' | 'verified' | 'disputed' | 'deprecated'
  claimedAt: Date
}

export interface POIAction {
  id: string
  nodeId: string
  actionType: string
  actionInput: Record<string, any>
  actionOutput?: Record<string, any>
  optimizationScore?: number
  decisionContext?: Record<string, any>
  verified: boolean
  executedAt: Date
}

export interface TokenBalance {
  nodeId: string
  balanceMicro: number // 1 AUREV = 1,000,000 micro-AUREV
  lockedBalanceMicro: number
  totalEarnedMicro: number
  totalAllocatedMicro: number
}

export interface TokenTransaction {
  id: string
  transactionHash: string
  fromNodeId?: string
  toNodeId: string
  amountMicro: number
  transactionType: TransactionType
  contextId?: string
  contextType?: string
  description?: string
  createdAt: Date
}

// =====================================================
// AUREV PROTOCOL ENGINE
// =====================================================

export class AUREVProtocolEngine {
  private supabase = getServerSupabase()
  
  // =====================================================
  // LAYER 0: COGNITIVE CONSENSUS
  // =====================================================
  
  /**
   * Register a new node (human, AI, org) in the protocol
   */
  async registerNode(
    nodeType: NodeType,
    nodeIdentifier: string,
    options: {
      displayName?: string
      description?: string
      cognitiveProfile?: Record<string, any>
      metadata?: Record<string, any>
    } = {}
  ): Promise<AUREVNode> {
    const { data, error } = await this.supabase
      .from('aurev5_nodes')
      .insert({
        node_type: nodeType,
        node_identifier: nodeIdentifier,
        display_name: options.displayName,
        description: options.description,
        cognitive_profile: options.cognitiveProfile || {},
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to register node: ${error.message}`)
    }
    
    return this.mapToNode(data)
  }
  
  /**
   * Get node by identifier
   */
  async getNode(nodeIdentifier: string): Promise<AUREVNode | null> {
    const { data, error } = await this.supabase
      .from('aurev5_nodes')
      .select('*')
      .eq('node_identifier', nodeIdentifier)
      .eq('status', 'active')
      .single()
    
    if (error || !data) {
      return null
    }
    
    return this.mapToNode(data)
  }
  
  /**
   * Submit a knowledge claim for consensus
   */
  async submitClaim(
    nodeId: string,
    claimType: ClaimType,
    claimContent: Record<string, any>,
    options: {
      context?: Record<string, any>
      expiresAt?: Date
      metadata?: Record<string, any>
    } = {}
  ): Promise<ConsensusClaim> {
    const { data, error } = await this.supabase
      .from('aurev5_consensus')
      .insert({
        node_id: nodeId,
        claim_type: claimType,
        claim_content: claimContent,
        claim_context: options.context || {},
        expires_at: options.expiresAt?.toISOString(),
        metadata: options.metadata || {},
        status: 'pending',
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to submit claim: ${error.message}`)
    }
    
    return this.mapToClaim(data)
  }
  
  /**
   * Verify a consensus claim (contribute to verification)
   */
  async verifyClaim(
    claimId: string,
    verifyingNodeId: string,
    verificationScore: number, // 0-100
    options: {
      dispute?: boolean
      evidence?: Record<string, any>
    } = {}
  ): Promise<void> {
    // Get current claim
    const { data: claim } = await this.supabase
      .from('aurev5_consensus')
      .select('*')
      .eq('id', claimId)
      .single()
    
    if (!claim) {
      throw new Error('Claim not found')
    }
    
    const verifiedBy = (claim.verified_by_nodes || []) as string[]
    const disputedBy = (claim.disputed_by_nodes || []) as string[]
    
    if (options.dispute) {
      // Add to disputes
      if (!disputedBy.includes(verifyingNodeId)) {
        disputedBy.push(verifyingNodeId)
      }
    } else {
      // Add to verifications
      if (!verifiedBy.includes(verifyingNodeId)) {
        verifiedBy.push(verifyingNodeId)
      }
    }
    
    // Calculate consensus level
    const totalParticipants = verifiedBy.length + disputedBy.length
    const consensusLevel = totalParticipants > 0
      ? (verifiedBy.length / totalParticipants) * 100
      : 0
    
    // Update verification score (weighted average)
    const currentScore = claim.verification_score || 0
    const participantCount = claim.participant_count || 0
    const newScore = participantCount > 0
      ? ((currentScore * participantCount) + verificationScore) / (participantCount + 1)
      : verificationScore
    
    // Update consensus
    const { error } = await this.supabase
      .from('aurev5_consensus')
      .update({
        verified_by_nodes: verifiedBy,
        disputed_by_nodes: disputedBy,
        verification_score: newScore,
        consensus_level: consensusLevel,
        participant_count: totalParticipants,
        status: consensusLevel >= 75 ? 'verified' : 'pending',
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', claimId)
    
    if (error) {
      throw new Error(`Failed to verify claim: ${error.message}`)
    }
    
    // Update node's verified knowledge contributions
    if (!options.dispute && verificationScore >= 70) {
      await this.supabase
        .from('aurev5_nodes')
        .update({
          verified_knowledge_contributions: claim.verified_knowledge_contributions + 1,
        })
        .eq('id', verifyingNodeId)
    }
  }
  
  /**
   * Record a Proof-of-Intelligence action (optimized decision)
   */
  async recordPOIAction(
    nodeId: string,
    actionType: string,
    actionInput: Record<string, any>,
    options: {
      actionOutput?: Record<string, any>
      optimizationScore?: number
      decisionContext?: Record<string, any>
      alternativesConsidered?: any[]
      reasoningTrace?: any[]
      metadata?: Record<string, any>
    } = {}
  ): Promise<POIAction> {
    const { data, error } = await this.supabase
      .from('aurev5_poi_actions')
      .insert({
        node_id: nodeId,
        action_type: actionType,
        action_input: actionInput,
        action_output: options.actionOutput,
        optimization_score: options.optimizationScore,
        decision_context: options.decisionContext || {},
        alternatives_considered: options.alternativesConsidered || [],
        reasoning_trace: options.reasoningTrace || [],
        metadata: options.metadata || {},
        verified: false,
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to record PoI action: ${error.message}`)
    }
    
    // Update node's optimized decisions count
    const { data: node } = await this.supabase
      .from('aurev5_nodes')
      .select('optimized_decisions_executed')
      .eq('id', nodeId)
      .single()
    
    if (node) {
      await this.supabase
        .from('aurev5_nodes')
        .update({
          optimized_decisions_executed: (node.optimized_decisions_executed || 0) + 1,
        })
        .eq('id', nodeId)
    }
    
    return this.mapToPOIAction(data)
  }
  
  /**
   * Verify a PoI action (validate optimization)
   */
  async verifyPOIAction(
    actionId: string,
    verifyingNodeId: string,
    outcomeSuccess: boolean,
    outcomeMetrics?: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('aurev5_poi_actions')
      .update({
        verified: true,
        verified_by_node: verifyingNodeId,
        verification_timestamp: new Date().toISOString(),
        outcome_success: outcomeSuccess,
        outcome_metrics: outcomeMetrics || {},
      })
      .eq('id', actionId)
    
    if (error) {
      throw new Error(`Failed to verify PoI action: ${error.message}`)
    }
  }
  
  // =====================================================
  // LAYER 1: VALUE & TRUST FABRIC
  // =====================================================
  
  /**
   * Get token balance for a node
   */
  async getTokenBalance(nodeId: string): Promise<TokenBalance> {
    const { data, error } = await this.supabase
      .from('aurev5_token_balances')
      .select('*')
      .eq('node_id', nodeId)
      .single()
    
    if (error || !data) {
      // Return zero balance if not found
      return {
        nodeId,
        balanceMicro: 0,
        lockedBalanceMicro: 0,
        totalEarnedMicro: 0,
        totalAllocatedMicro: 0,
      }
    }
    
    return {
      nodeId: data.node_id,
      balanceMicro: Number(data.balance_micro || 0),
      lockedBalanceMicro: Number(data.locked_balance_micro || 0),
      totalEarnedMicro: Number(data.total_earned_micro || 0),
      totalAllocatedMicro: Number(data.total_allocated_micro || 0),
    }
  }
  
  /**
   * Record a token transaction
   */
  async recordTokenTransaction(
    fromNodeId: string | null,
    toNodeId: string,
    amountMicro: number,
    transactionType: TransactionType,
    options: {
      contextId?: string
      contextType?: string
      description?: string
      metadata?: Record<string, any>
    } = {}
  ): Promise<TokenTransaction> {
    // Generate transaction hash
    const txData = JSON.stringify({
      from: fromNodeId,
      to: toNodeId,
      amount: amountMicro,
      type: transactionType,
      timestamp: Date.now(),
      context: options.contextId,
    })
    const transactionHash = crypto.createHash('sha256').update(txData).digest('hex')
    
    // Use database function to record transaction and update balances
    const { data: txId, error } = await this.supabase.rpc('record_token_transaction', {
      p_from_node: fromNodeId,
      p_to_node: toNodeId,
      p_amount_micro: amountMicro,
      p_tx_type: transactionType,
      p_tx_hash: transactionHash,
      p_context_id: options.contextId || null,
      p_context_type: options.contextType || null,
      p_description: options.description || null,
    })
    
    if (error) {
      throw new Error(`Failed to record transaction: ${error.message}`)
    }
    
    // Fetch the transaction record
    const { data } = await this.supabase
      .from('aurev5_token_transactions')
      .select('*')
      .eq('id', txId)
      .single()
    
    return this.mapToTransaction(data)
  }
  
  /**
   * Reward PoI action (automatic reward for verified optimization)
   */
  async rewardPOIAction(
    actionId: string,
    rewardAmountMicro: number = 1000000 // Default: 1 AUREV
  ): Promise<TokenTransaction> {
    // Get the action
    const { data: action } = await this.supabase
      .from('aurev5_poi_actions')
      .select('node_id, optimization_score')
      .eq('id', actionId)
      .single()
    
    if (!action) {
      throw new Error('PoI action not found')
    }
    
    // Scale reward by optimization score
    const scaledReward = Math.floor(
      rewardAmountMicro * ((action.optimization_score || 50) / 100)
    )
    
    // Reward the node
    return this.recordTokenTransaction(
      null, // From protocol (mint)
      action.node_id,
      scaledReward,
      'poi_reward',
      {
        contextId: actionId,
        contextType: 'poi_action',
        description: `PoI reward for optimized decision`,
      }
    )
  }
  
  /**
   * Reward consensus participation
   */
  async rewardConsensusParticipation(
    claimId: string,
    verifyingNodeId: string,
    rewardAmountMicro: number = 500000 // Default: 0.5 AUREV
  ): Promise<TokenTransaction> {
    return this.recordTokenTransaction(
      null,
      verifyingNodeId,
      rewardAmountMicro,
      'consensus_reward',
      {
        contextId: claimId,
        contextType: 'consensus',
        description: `Consensus participation reward`,
      }
    )
  }
  
  /**
   * Update trust score between nodes
   */
  async updateTrustScore(
    fromNodeId: string,
    toNodeId: string,
    interactionType: string,
    trustDelta: number // -100 to +100
  ): Promise<void> {
    // Get current trust relationship
    const { data: existing } = await this.supabase
      .from('aurev5_trust_network')
      .select('*')
      .eq('from_node_id', fromNodeId)
      .eq('to_node_id', toNodeId)
      .single()
    
    const currentScore = existing?.trust_score || 50
    const newScore = Math.max(0, Math.min(100, currentScore + trustDelta))
    
    const trustHistory = existing?.trust_history || []
    trustHistory.push({
      timestamp: new Date().toISOString(),
      interactionType,
      delta: trustDelta,
      newScore,
    })
    
    // Keep only last 100 history entries
    const recentHistory = trustHistory.slice(-100)
    
    if (existing) {
      // Update existing
      await this.supabase
        .from('aurev5_trust_network')
        .update({
          trust_score: newScore,
          interaction_count: (existing.interaction_count || 0) + 1,
          last_interaction_at: new Date().toISOString(),
          last_interaction_type: interactionType,
          trust_history: recentHistory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Create new
      await this.supabase
        .from('aurev5_trust_network')
        .insert({
          from_node_id: fromNodeId,
          to_node_id: toNodeId,
          trust_score: newScore,
          interaction_count: 1,
          last_interaction_at: new Date().toISOString(),
          last_interaction_type: interactionType,
          trust_history: recentHistory,
        })
    }
  }
  
  // =====================================================
  // HELPER METHODS
  // =====================================================
  
  private mapToNode(data: any): AUREVNode {
    return {
      id: data.id,
      nodeType: data.node_type,
      nodeIdentifier: data.node_identifier,
      displayName: data.display_name,
      description: data.description,
      cognitiveProfile: data.cognitive_profile || {},
      intelligenceScore: Number(data.intelligence_score || 0),
      verifiedKnowledgeContributions: Number(data.verified_knowledge_contributions || 0),
      optimizedDecisionsExecuted: Number(data.optimized_decisions_executed || 0),
      consensusParticipations: Number(data.consensus_participations || 0),
      status: data.status,
      registeredAt: new Date(data.registered_at),
    }
  }
  
  private mapToClaim(data: any): ConsensusClaim {
    return {
      id: data.id,
      nodeId: data.node_id,
      claimType: data.claim_type,
      claimContent: data.claim_content,
      claimContext: data.claim_context || {},
      verificationScore: Number(data.verification_score || 0),
      consensusLevel: Number(data.consensus_level || 0),
      participantCount: Number(data.participant_count || 0),
      status: data.status,
      claimedAt: new Date(data.claimed_at),
    }
  }
  
  private mapToPOIAction(data: any): POIAction {
    return {
      id: data.id,
      nodeId: data.node_id,
      actionType: data.action_type,
      actionInput: data.action_input,
      actionOutput: data.action_output,
      optimizationScore: data.optimization_score ? Number(data.optimization_score) : undefined,
      decisionContext: data.decision_context || {},
      verified: data.verified || false,
      executedAt: new Date(data.executed_at),
    }
  }
  
  private mapToTransaction(data: any): TokenTransaction {
    return {
      id: data.id,
      transactionHash: data.transaction_hash,
      fromNodeId: data.from_node_id,
      toNodeId: data.to_node_id,
      amountMicro: Number(data.amount_micro),
      transactionType: data.transaction_type,
      contextId: data.context_id,
      contextType: data.context_type,
      description: data.description,
      createdAt: new Date(data.created_at),
    }
  }
}

// Singleton instance
let protocolEngineInstance: AUREVProtocolEngine | null = null

export function getProtocolEngine(): AUREVProtocolEngine {
  if (!protocolEngineInstance) {
    protocolEngineInstance = new AUREVProtocolEngine()
  }
  return protocolEngineInstance
}

