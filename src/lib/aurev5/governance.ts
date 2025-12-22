/**
 * AUREV Protocol v5 - Governance System
 * 
 * AUREV Senate: 1000-member rotating council (70% human, 30% AI)
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface SenateMember {
  id: string
  nodeId: string
  memberType: 'human' | 'ai_agent'
  delegateRole?: 'representative' | 'senator' | 'chair'
  termStart: Date
  termEnd: Date
  isActive: boolean
  proposalsSubmitted: number
  votesCast: number
  influenceScore: number
}

export interface SenateProposal {
  id: string
  proposerNodeId: string
  proposalTitle: string
  proposalContent: Record<string, any>
  proposalType: 'protocol' | 'governance' | 'allocation' | 'policy' | 'constitutional'
  votesFor: number
  votesAgainst: number
  votesAbstain: number
  requiredQuorum: number
  votingEndsAt: Date
  status: 'draft' | 'open' | 'passed' | 'rejected' | 'expired'
  createdAt: Date
  passedAt?: Date
}

export interface SenateVote {
  proposalId: string
  nodeId: string
  vote: 'for' | 'against' | 'abstain'
  reasoning?: string
  castAt: Date
}

/**
 * AUREV Senate Governance Engine
 */
export class AUREVSenate {
  private supabase = getServerSupabase()
  
  // Target: 1000 members (700 human, 300 AI)
  private readonly TARGET_SENATE_SIZE = 1000
  private readonly HUMAN_RATIO = 0.7
  private readonly AI_RATIO = 0.3
  
  /**
   * Get current active senate members
   */
  async getActiveMembers(): Promise<SenateMember[]> {
    const { data, error } = await this.supabase
      .from('aurev5_senate_members')
      .select('*')
      .eq('is_active', true)
      .order('appointed_at', { ascending: false })
    
    if (error) {
      throw new Error(`Failed to fetch senate members: ${error.message}`)
    }
    
    return (data || []).map(this.mapToSenateMember)
  }
  
  /**
   * Appoint a new senate member
   */
  async appointMember(
    nodeId: string,
    memberType: 'human' | 'ai_agent',
    options: {
      delegateRole?: SenateMember['delegateRole']
      termLengthDays?: number
      metadata?: Record<string, any>
    } = {}
  ): Promise<SenateMember> {
    const termLengthDays = options.termLengthDays || 90 // Default 3 months
    const termStart = new Date()
    const termEnd = new Date()
    termEnd.setDate(termEnd.getDate() + termLengthDays)
    
    // Check current composition
    const currentMembers = await this.getActiveMembers()
    const humanCount = currentMembers.filter(m => m.memberType === 'human').length
    const aiCount = currentMembers.filter(m => m.memberType === 'ai_agent').length
    
    // Enforce ratio (if possible)
    const targetHumanCount = Math.floor(this.TARGET_SENATE_SIZE * this.HUMAN_RATIO)
    const targetAICount = Math.floor(this.TARGET_SENATE_SIZE * this.AI_RATIO)
    
    if (memberType === 'human' && humanCount >= targetHumanCount) {
      throw new Error('Human senate quota reached')
    }
    if (memberType === 'ai_agent' && aiCount >= targetAICount) {
      throw new Error('AI senate quota reached')
    }
    
    const { data, error } = await this.supabase
      .from('aurev5_senate_members')
      .insert({
        node_id: nodeId,
        member_type: memberType,
        delegate_role: options.delegateRole,
        term_start: termStart.toISOString(),
        term_end: termEnd.toISOString(),
        is_active: true,
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to appoint senate member: ${error.message}`)
    }
    
    return this.mapToSenateMember(data)
  }
  
  /**
   * Create a senate proposal
   */
  async createProposal(
    proposerNodeId: string,
    proposalTitle: string,
    proposalContent: Record<string, any>,
    proposalType: SenateProposal['proposalType'],
    options: {
      votingDurationDays?: number
      requiredQuorum?: number
      metadata?: Record<string, any>
    } = {}
  ): Promise<SenateProposal> {
    const votingDurationDays = options.votingDurationDays || 7 // Default 7 days
    const votingEndsAt = new Date()
    votingEndsAt.setDate(votingEndsAt.getDate() + votingDurationDays)
    
    const activeMembers = await this.getActiveMembers()
    const requiredQuorum = options.requiredQuorum || Math.ceil(activeMembers.length * 0.5) // Default 50%
    
    const { data, error } = await this.supabase
      .from('aurev5_senate_proposals')
      .insert({
        proposer_node_id: proposerNodeId,
        proposal_title: proposalTitle,
        proposal_content: proposalContent,
        proposal_type: proposalType,
        required_quorum: requiredQuorum,
        voting_ends_at: votingEndsAt.toISOString(),
        status: 'open',
        metadata: options.metadata || {},
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to create proposal: ${error.message}`)
    }
    
    // Update proposer's proposals count
    await this.updateMemberMetrics(proposerNodeId, { proposalsSubmitted: 1 })
    
    return this.mapToProposal(data)
  }
  
  /**
   * Cast a vote on a proposal
   */
  async castVote(
    proposalId: string,
    nodeId: string,
    vote: 'for' | 'against' | 'abstain',
    reasoning?: string
  ): Promise<void> {
    // Check if proposal is open
    const { data: proposal } = await this.supabase
      .from('aurev5_senate_proposals')
      .select('*')
      .eq('id', proposalId)
      .single()
    
    if (!proposal) {
      throw new Error('Proposal not found')
    }
    
    if (proposal.status !== 'open') {
      throw new Error('Proposal is not open for voting')
    }
    
    if (new Date() > new Date(proposal.voting_ends_at)) {
      // Expire proposal
      await this.supabase
        .from('aurev5_senate_proposals')
        .update({ status: 'expired' })
        .eq('id', proposalId)
      
      throw new Error('Voting period has ended')
    }
    
    // Update vote counts (in a real system, use a votes table to prevent double voting)
    const update: any = {}
    if (vote === 'for') {
      update.votes_for = (proposal.votes_for || 0) + 1
    } else if (vote === 'against') {
      update.votes_against = (proposal.votes_against || 0) + 1
    } else {
      update.votes_abstain = (proposal.votes_abstain || 0) + 1
    }
    
    await this.supabase
      .from('aurev5_senate_proposals')
      .update(update)
      .eq('id', proposalId)
    
    // Update member's votes cast
    await this.updateMemberMetrics(nodeId, { votesCast: 1 })
    
    // Check if proposal should pass
    await this.checkProposalStatus(proposalId)
  }
  
  /**
   * Check and update proposal status based on votes
   */
  private async checkProposalStatus(proposalId: string): Promise<void> {
    const { data: proposal } = await this.supabase
      .from('aurev5_senate_proposals')
      .select('*')
      .eq('id', proposalId)
      .single()
    
    if (!proposal || proposal.status !== 'open') {
      return
    }
    
    const totalVotes = (proposal.votes_for || 0) + (proposal.votes_against || 0) + (proposal.votes_abstain || 0)
    const hasQuorum = totalVotes >= proposal.required_quorum
    const majorityFor = (proposal.votes_for || 0) > (proposal.votes_against || 0)
    
    if (hasQuorum) {
      const newStatus = majorityFor ? 'passed' : 'rejected'
      const update: any = {
        status: newStatus,
      }
      
      if (newStatus === 'passed') {
        update.passed_at = new Date().toISOString()
      }
      
      await this.supabase
        .from('aurev5_senate_proposals')
        .update(update)
        .eq('id', proposalId)
    }
  }
  
  /**
   * Get active proposals
   */
  async getActiveProposals(): Promise<SenateProposal[]> {
    const { data, error } = await this.supabase
      .from('aurev5_senate_proposals')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    
    if (error) {
      throw new Error(`Failed to fetch proposals: ${error.message}`)
    }
    
    return (data || []).map(this.mapToProposal)
  }
  
  /**
   * Update senate member metrics
   */
  private async updateMemberMetrics(
    nodeId: string,
    updates: { proposalsSubmitted?: number; votesCast?: number }
  ): Promise<void> {
    const member = await this.getMemberByNodeId(nodeId)
    if (!member) {
      return
    }
    
    const update: any = {}
    if (updates.proposalsSubmitted) {
      update.proposals_submitted = (member.proposalsSubmitted || 0) + updates.proposalsSubmitted
    }
    if (updates.votesCast) {
      update.votes_cast = (member.votesCast || 0) + updates.votesCast
    }
    
    await this.supabase
      .from('aurev5_senate_members')
      .update(update)
      .eq('id', member.id)
  }
  
  /**
   * Get member by node ID
   */
  private async getMemberByNodeId(nodeId: string): Promise<SenateMember | null> {
    const { data } = await this.supabase
      .from('aurev5_senate_members')
      .select('*')
      .eq('node_id', nodeId)
      .eq('is_active', true)
      .single()
    
    return data ? this.mapToSenateMember(data) : null
  }
  
  /**
   * Rotate senate members (end terms, appoint new)
   */
  async rotateSenate(): Promise<{
    expired: number
    appointed: number
  }> {
    const now = new Date()
    
    // Expire old terms
    const { data: expired } = await this.supabase
      .from('aurev5_senate_members')
      .update({ is_active: false })
      .lt('term_end', now.toISOString())
      .eq('is_active', true)
      .select()
    
    const expiredCount = expired?.length || 0
    
    // Appoint new members (would need selection algorithm)
    // This is a placeholder - actual implementation would use reputation, voting, etc.
    const appointedCount = 0
    
    return {
      expired: expiredCount,
      appointed: appointedCount,
    }
  }
  
  private mapToSenateMember(data: any): SenateMember {
    return {
      id: data.id,
      nodeId: data.node_id,
      memberType: data.member_type,
      delegateRole: data.delegate_role,
      termStart: new Date(data.term_start),
      termEnd: new Date(data.term_end),
      isActive: data.is_active,
      proposalsSubmitted: Number(data.proposals_submitted || 0),
      votesCast: Number(data.votes_cast || 0),
      influenceScore: Number(data.influence_score || 0),
    }
  }
  
  private mapToProposal(data: any): SenateProposal {
    return {
      id: data.id,
      proposerNodeId: data.proposer_node_id,
      proposalTitle: data.proposal_title,
      proposalContent: data.proposal_content,
      proposalType: data.proposal_type,
      votesFor: Number(data.votes_for || 0),
      votesAgainst: Number(data.votes_against || 0),
      votesAbstain: Number(data.votes_abstain || 0),
      requiredQuorum: Number(data.required_quorum || 0),
      votingEndsAt: new Date(data.voting_ends_at),
      status: data.status,
      createdAt: new Date(data.created_at),
      passedAt: data.passed_at ? new Date(data.passed_at) : undefined,
    }
  }
}

// Singleton instance
let senateInstance: AUREVSenate | null = null

export function getSenate(): AUREVSenate {
  if (!senateInstance) {
    senateInstance = new AUREVSenate()
  }
  return senateInstance
}

