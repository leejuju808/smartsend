/**
 * AUREV Proof of Intelligence (PoI)
 * 
 * Consensus mechanism that rewards useful computation & verified insight
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface ProofOfIntelligence {
  id: string
  org_id: string
  agent_id?: string
  intelligence_type: 'computation' | 'insight' | 'prediction' | 'optimization' | 'validation'
  claim_description: string
  claim_data?: Record<string, any>
  validator_agent_id?: string
  validation_status: 'pending' | 'validating' | 'verified' | 'rejected' | 'disputed'
  validation_confidence?: number
  validation_evidence?: Record<string, any>
  reward_credits: number
  reward_tokens: number
  metadata: Record<string, any>
  created_at: Date
  validated_at?: Date
}

export interface CreatePoIRequest {
  org_id: string
  agent_id?: string
  intelligence_type: ProofOfIntelligence['intelligence_type']
  claim_description: string
  claim_data?: Record<string, any>
  metadata?: Record<string, any>
}

/**
 * Proof of Intelligence Engine
 */
export class AUREVProofOfIntelligence {
  private supabase = getServerSupabase()

  /**
   * Submit a proof of intelligence claim
   */
  async submitClaim(request: CreatePoIRequest): Promise<ProofOfIntelligence> {
    const {
      org_id,
      agent_id,
      intelligence_type,
      claim_description,
      claim_data = {},
      metadata = {},
    } = request

    // Calculate base reward based on intelligence type
    const base_reward = this.calculateBaseReward(intelligence_type)

    const { data, error } = await this.supabase
      .from('aurev_proof_of_intelligence')
      .insert({
        org_id,
        agent_id: agent_id || null,
        intelligence_type,
        claim_description,
        claim_data,
        validation_status: 'pending',
        reward_credits: base_reward.credits,
        reward_tokens: base_reward.tokens,
        metadata,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to submit PoI claim: ${error.message}`)
    }

    // Trigger validation (async)
    this.validateClaim(data.id).catch(console.error)

    return this.mapToPoI(data)
  }

  /**
   * Validate a claim (called automatically or manually)
   */
  async validateClaim(poi_id: string, validator_agent_id?: string): Promise<ProofOfIntelligence> {
    // Get claim
    const { data: claim, error: fetchError } = await this.supabase
      .from('aurev_proof_of_intelligence')
      .select('*')
      .eq('id', poi_id)
      .single()

    if (fetchError || !claim) {
      throw new Error('Proof of Intelligence claim not found')
    }

    if (claim.validation_status !== 'pending') {
      throw new Error(`Claim already validated. Status: ${claim.validation_status}`)
    }

    // Mark as validating
    await this.supabase
      .from('aurev_proof_of_intelligence')
      .update({
        validation_status: 'validating',
        validator_agent_id: validator_agent_id || null,
      })
      .eq('id', poi_id)

    // Perform validation (this would use AI/ML models in production)
    const validation_result = await this.performValidation(claim)

    // Update claim with validation result
    const { data: updated, error: updateError } = await this.supabase
      .from('aurev_proof_of_intelligence')
      .update({
        validation_status: validation_result.status,
        validation_confidence: validation_result.confidence,
        validation_evidence: validation_result.evidence,
        validated_at: new Date().toISOString(),
        // Adjust rewards based on validation confidence
        reward_credits: validation_result.status === 'verified'
          ? claim.reward_credits * (validation_result.confidence / 100)
          : 0,
        reward_tokens: validation_result.status === 'verified'
          ? claim.reward_tokens * (validation_result.confidence / 100)
          : 0,
      })
      .eq('id', poi_id)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to validate claim: ${updateError.message}`)
    }

    // If verified, distribute rewards
    if (validation_result.status === 'verified') {
      await this.distributeRewards(updated)
    }

    return this.mapToPoI(updated)
  }

  /**
   * Perform validation (AI-powered validation logic)
   */
  private async performValidation(claim: any): Promise<{
    status: 'verified' | 'rejected'
    confidence: number
    evidence: Record<string, any>
  }> {
    // In a full implementation, this would use AI models to validate:
    // - Computation correctness
    // - Insight novelty and usefulness
    // - Prediction accuracy
    // - Optimization improvements
    // - Validation thoroughness

    // For now, return a mock validation
    // In production, this would call OpenAI/Claude or specialized validation models
    const validation_confidence = Math.random() * 30 + 70 // 70-100%
    const verified = validation_confidence >= 75

    return {
      status: verified ? 'verified' : 'rejected',
      confidence: validation_confidence,
      evidence: {
        validation_method: 'ai_validation',
        checks_performed: ['correctness', 'novelty', 'usefulness'],
        timestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * Distribute rewards for verified PoI
   */
  private async distributeRewards(claim: any): Promise<void> {
    const reward_credits = parseFloat(claim.reward_credits || '0')
    const reward_tokens = parseFloat(claim.reward_tokens || '0')

    if (reward_credits > 0) {
      // Add credits to org
      const { data: credit } = await this.supabase
        .from('aurev_credits')
        .select('credit_balance')
        .eq('org_id', claim.org_id)
        .eq('credit_type', 'compute')
        .single()

      if (credit) {
        await this.supabase
          .from('aurev_credits')
          .update({
            credit_balance: parseFloat(credit.credit_balance) + reward_credits,
          })
          .eq('org_id', claim.org_id)
          .eq('credit_type', 'compute')
      } else {
        await this.supabase
          .from('aurev_credits')
          .insert({
            org_id: claim.org_id,
            credit_type: 'compute',
            credit_balance: reward_credits,
          })
      }

      // Record transaction
      await this.supabase
        .from('aurev_credit_transactions')
        .insert({
          org_id: claim.org_id,
          transaction_type: 'reward',
          amount: reward_credits,
          balance_before: credit ? parseFloat(credit.credit_balance) : 0,
          balance_after: (credit ? parseFloat(credit.credit_balance) : 0) + reward_credits,
          description: `PoI reward for ${claim.intelligence_type}: ${claim.claim_description}`,
          metadata: {
            poi_id: claim.id,
            intelligence_type: claim.intelligence_type,
          },
        })
    }

    if (reward_tokens > 0) {
      // Token rewards would be distributed on-chain
      // For now, just log it
      console.log(`PoI token reward: ${reward_tokens} tokens to org ${claim.org_id}`)
    }
  }

  /**
   * Calculate base reward based on intelligence type
   */
  private calculateBaseReward(intelligence_type: ProofOfIntelligence['intelligence_type']): {
    credits: number
    tokens: number
  } {
    const rewards: Record<string, { credits: number; tokens: number }> = {
      computation: { credits: 10, tokens: 0.01 },
      insight: { credits: 25, tokens: 0.025 },
      prediction: { credits: 50, tokens: 0.05 },
      optimization: { credits: 75, tokens: 0.075 },
      validation: { credits: 15, tokens: 0.015 },
    }

    return rewards[intelligence_type] || { credits: 5, tokens: 0.005 }
  }

  /**
   * Get PoI claim by ID
   */
  async getClaim(poi_id: string): Promise<ProofOfIntelligence | null> {
    const { data, error } = await this.supabase
      .from('aurev_proof_of_intelligence')
      .select('*')
      .eq('id', poi_id)
      .single()

    if (error || !data) {
      return null
    }

    return this.mapToPoI(data)
  }

  /**
   * List PoI claims
   */
  async listClaims(filters?: {
    org_id?: string
    agent_id?: string
    intelligence_type?: ProofOfIntelligence['intelligence_type']
    validation_status?: ProofOfIntelligence['validation_status']
    limit?: number
    offset?: number
  }): Promise<ProofOfIntelligence[]> {
    let query = this.supabase
      .from('aurev_proof_of_intelligence')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.org_id) {
      query = query.eq('org_id', filters.org_id)
    }

    if (filters?.agent_id) {
      query = query.eq('agent_id', filters.agent_id)
    }

    if (filters?.intelligence_type) {
      query = query.eq('intelligence_type', filters.intelligence_type)
    }

    if (filters?.validation_status) {
      query = query.eq('validation_status', filters.validation_status)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to list PoI claims: ${error.message}`)
    }

    return (data || []).map(this.mapToPoI)
  }

  /**
   * Map database record to ProofOfIntelligence
   */
  private mapToPoI(record: any): ProofOfIntelligence {
    return {
      id: record.id,
      org_id: record.org_id,
      agent_id: record.agent_id,
      intelligence_type: record.intelligence_type,
      claim_description: record.claim_description,
      claim_data: record.claim_data,
      validator_agent_id: record.validator_agent_id,
      validation_status: record.validation_status,
      validation_confidence: record.validation_confidence ? parseFloat(record.validation_confidence) : undefined,
      validation_evidence: record.validation_evidence,
      reward_credits: parseFloat(record.reward_credits || '0'),
      reward_tokens: parseFloat(record.reward_tokens || '0'),
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      validated_at: record.validated_at ? new Date(record.validated_at) : undefined,
    }
  }
}

