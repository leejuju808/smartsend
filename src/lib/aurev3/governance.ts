/**
 * AUREV Governance Model
 * 
 * DAO board, governance tokens, safety council
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface GovernanceToken {
  id: string
  userId: string
  orgId?: string
  tokenType: 'dao_member' | 'contributor' | 'safety_council'
  reputationScore: number
  contributionsCount: number
  validatedGradients: number
  approvedPolicies: number
  totalDecisionsReviewed: number
  active: boolean
  lastActivityAt?: Date
}

export interface GovernanceVote {
  id: string
  proposalId: string
  proposalType: 'policy' | 'model_release' | 'credit_rule' | 'network_upgrade'
  voterId: string
  vote: 'approve' | 'reject' | 'abstain'
  voteWeight: number
  createdAt: Date
}

export interface Proposal {
  id: string
  proposalType: GovernanceVote['proposalType']
  title: string
  description: string
  proposerId: string
  status: 'draft' | 'voting' | 'passed' | 'rejected'
  votes: {
    approve: number
    reject: number
    abstain: number
    totalWeight: number
  }
  createdAt: Date
  votingEndsAt?: Date
}

/**
 * Governance System
 */
export class GovernanceSystem {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  
  /**
   * Get top contributors (DAO members)
   */
  async getTopContributors(limit: number = 100): Promise<GovernanceToken[]> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_tokens')
      .select('*')
      .eq('active', true)
      .order('reputation_score', { ascending: false })
      .limit(limit)
    
    if (error) {
      throw new Error(`Failed to fetch contributors: ${error.message}`)
    }
    
    return (data || []).map(this.mapToGovernanceToken)
  }
  
  /**
   * Award governance token for contribution
   */
  async awardToken(
    userId: string,
    tokenType: GovernanceToken['tokenType'],
    reputationIncrease: number = 1.0,
    contributionType?: string
  ): Promise<GovernanceToken> {
    // Get or create token
    const { data: existing } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('token_type', tokenType)
      .single()
    
    if (existing) {
      // Update existing token
      const { data, error } = await const supabase = await this.getSupabase()
    const supabase
        .from('aurev_governance_tokens')
        .update({
          reputation_score: (parseFloat(existing.reputation_score?.toString() || '0') + reputationIncrease),
          contributions_count: existing.contributions_count + 1,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
      
      if (error) {
        throw new Error(`Failed to update token: ${error.message}`)
      }
      
      return this.mapToGovernanceToken(data)
    } else {
      // Create new token
      const updateData: any = {
        user_id: userId,
        token_type: tokenType,
        reputation_score: reputationIncrease,
        contributions_count: 1,
        active: true,
        last_activity_at: new Date().toISOString(),
      }
      
      if (contributionType === 'gradient') {
        updateData.validated_gradients = 1
      } else if (contributionType === 'policy') {
        updateData.approved_policies = 1
      }
      
      const { data, error } = await const supabase = await this.getSupabase()
    const supabase
        .from('aurev_governance_tokens')
        .insert(updateData)
        .select()
        .single()
      
      if (error) {
        throw new Error(`Failed to create token: ${error.message}`)
      }
      
      return this.mapToGovernanceToken(data)
    }
  }
  
  /**
   * Cast vote on proposal
   */
  async castVote(
    userId: string,
    proposalId: string,
    proposalType: GovernanceVote['proposalType'],
    vote: GovernanceVote['vote']
  ): Promise<void> {
    // Get user's governance tokens
    const { data: tokens } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_tokens')
      .select('id, reputation_score')
      .eq('user_id', userId)
      .eq('active', true)
    
    if (!tokens || tokens.length === 0) {
      throw new Error('No governance tokens found for user')
    }
    
    // Calculate vote weight (sum of reputation scores)
    const voteWeight = tokens.reduce(
      (sum, token) => sum + parseFloat(token.reputation_score?.toString() || '0'),
      0
    )
    
    // Record vote for each token (in production, might aggregate to single vote)
    const primaryToken = tokens[0]
    
    const { error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_votes')
      .insert({
        proposal_id: proposalId,
        proposal_type: proposalType,
        voter_id: userId,
        token_id: primaryToken.id,
        vote,
        vote_weight: voteWeight,
      })
    
    if (error) {
      throw new Error(`Failed to cast vote: ${error.message}`)
    }
  }
  
  /**
   * Get votes for proposal
   */
  async getProposalVotes(
    proposalId: string,
    proposalType: GovernanceVote['proposalType']
  ): Promise<{
    approve: number
    reject: number
    abstain: number
    totalWeight: number
    votes: GovernanceVote[]
  }> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_votes')
      .select('*')
      .eq('proposal_id', proposalId)
      .eq('proposal_type', proposalType)
    
    if (error) {
      throw new Error(`Failed to fetch votes: ${error.message}`)
    }
    
    const votes = (data || []).map(this.mapToGovernanceVote)
    
    let approve = 0
    let reject = 0
    let abstain = 0
    let totalWeight = 0
    
    votes.forEach(vote => {
      if (vote.vote === 'approve') {
        approve += vote.voteWeight
      } else if (vote.vote === 'reject') {
        reject += vote.voteWeight
      } else {
        abstain += vote.voteWeight
      }
      totalWeight += vote.voteWeight
    })
    
    return {
      approve,
      reject,
      abstain,
      totalWeight,
      votes,
    }
  }
  
  /**
   * Check if user is DAO member
   */
  async isDAOMember(userId: string): Promise<boolean> {
    const { data } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token_type', 'dao_member')
      .eq('active', true)
      .limit(1)
      .single()
    
    return !!data
  }
  
  /**
   * Check if user is Safety Council member
   */
  async isSafetyCouncilMember(userId: string): Promise<boolean> {
    const { data } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_governance_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token_type', 'safety_council')
      .eq('active', true)
      .limit(1)
      .single()
    
    return !!data
  }
  
  /**
   * Map database record to GovernanceToken
   */
  private mapToGovernanceToken(record: any): GovernanceToken {
    return {
      id: record.id,
      userId: record.user_id,
      orgId: record.org_id,
      tokenType: record.token_type,
      reputationScore: parseFloat(record.reputation_score?.toString() || '0'),
      contributionsCount: record.contributions_count || 0,
      validatedGradients: record.validated_gradients || 0,
      approvedPolicies: record.approved_policies || 0,
      totalDecisionsReviewed: record.total_decisions_reviewed || 0,
      active: record.active,
      lastActivityAt: record.last_activity_at ? new Date(record.last_activity_at) : undefined,
    }
  }
  
  /**
   * Map database record to GovernanceVote
   */
  private mapToGovernanceVote(record: any): GovernanceVote {
    return {
      id: record.id,
      proposalId: record.proposal_id,
      proposalType: record.proposal_type,
      voterId: record.voter_id,
      vote: record.vote,
      voteWeight: parseFloat(record.vote_weight?.toString() || '0'),
      createdAt: new Date(record.created_at),
    }
  }
}

