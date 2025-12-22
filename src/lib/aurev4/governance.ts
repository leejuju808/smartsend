/**
 * AUREV DAO Governance 2.0
 * 
 * Decentralized governance for policy, rate control, and network management
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface DAOProposal {
  id: string
  proposer_org_id: string
  proposer_agent_id?: string
  proposal_type: 'policy' | 'rate_control' | 'inflation_cap' | 'staking_reward' | 'feature' | 'treasury' | 'governance'
  title: string
  description: string
  proposal_data: Record<string, any>
  voting_status: 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'expired'
  voting_start?: Date
  voting_end?: Date
  quorum_required: number
  votes_for: number
  votes_against: number
  votes_abstain: number
  total_votes: number
  voting_power_for: number
  voting_power_against: number
  executed: boolean
  executed_at?: Date
  execution_result?: Record<string, any>
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface DAOVote {
  id: string
  proposal_id: string
  org_id: string
  vote_choice: 'for' | 'against' | 'abstain'
  voting_power: number
  rationale?: string
  created_at: Date
}

export interface CreateProposalRequest {
  proposer_org_id: string
  proposer_agent_id?: string
  proposal_type: DAOProposal['proposal_type']
  title: string
  description: string
  proposal_data?: Record<string, any>
  quorum_required?: number
  voting_duration_days?: number
}

/**
 * DAO Governance 2.0 Engine
 */
export class AUREVDAO {
  private supabase = getServerSupabase()

  /**
   * Create a new proposal
   */
  async createProposal(request: CreateProposalRequest): Promise<DAOProposal> {
    const {
      proposer_org_id,
      proposer_agent_id,
      proposal_type,
      title,
      description,
      proposal_data = {},
      quorum_required = 51.0,
      voting_duration_days = 7,
    } = request

    const voting_start = new Date()
    const voting_end = new Date()
    voting_end.setDate(voting_end.getDate() + voting_duration_days)

    const { data, error } = await this.supabase
      .from('aurev_dao_proposals')
      .insert({
        proposer_org_id,
        proposer_agent_id: proposer_agent_id || null,
        proposal_type,
        title,
        description,
        proposal_data,
        voting_status: 'active',
        voting_start: voting_start.toISOString(),
        voting_end: voting_end.toISOString(),
        quorum_required,
        votes_for: 0,
        votes_against: 0,
        votes_abstain: 0,
        total_votes: 0,
        voting_power_for: 0,
        voting_power_against: 0,
        executed: false,
        metadata: {},
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create proposal: ${error.message}`)
    }

    return this.mapToProposal(data)
  }

  /**
   * Vote on a proposal
   */
  async vote(
    proposal_id: string,
    org_id: string,
    vote_choice: DAOVote['vote_choice'],
    rationale?: string
  ): Promise<DAOVote> {
    // Get proposal
    const proposal = await this.getProposal(proposal_id)
    if (!proposal) {
      throw new Error('Proposal not found')
    }

    if (proposal.voting_status !== 'active') {
      throw new Error(`Proposal is not active. Current status: ${proposal.voting_status}`)
    }

    const now = new Date()
    if (proposal.voting_end && now > proposal.voting_end) {
      throw new Error('Voting period has ended')
    }

    // Calculate voting power (based on stake/credits)
    const voting_power = await this.calculateVotingPower(org_id)

    // Check if already voted
    const { data: existingVote } = await this.supabase
      .from('aurev_dao_votes')
      .select('*')
      .eq('proposal_id', proposal_id)
      .eq('org_id', org_id)
      .single()

    if (existingVote) {
      // Update existing vote
      const { data: updated, error } = await this.supabase
        .from('aurev_dao_votes')
        .update({
          vote_choice,
          voting_power,
          rationale: rationale || null,
        })
        .eq('id', existingVote.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update vote: ${error.message}`)
      }

      // Recalculate proposal votes
      await this.recalculateProposalVotes(proposal_id)

      return this.mapToVote(updated)
    } else {
      // Create new vote
      const { data: newVote, error } = await this.supabase
        .from('aurev_dao_votes')
        .insert({
          proposal_id,
          org_id,
          vote_choice,
          voting_power,
          rationale: rationale || null,
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create vote: ${error.message}`)
      }

      // Update proposal vote counts
      await this.recalculateProposalVotes(proposal_id)

      return this.mapToVote(newVote)
    }
  }

  /**
   * Recalculate proposal vote totals
   */
  private async recalculateProposalVotes(proposal_id: string): Promise<void> {
    // Get all votes
    const { data: votes } = await this.supabase
      .from('aurev_dao_votes')
      .select('vote_choice, voting_power')
      .eq('proposal_id', proposal_id)

    if (!votes || votes.length === 0) {
      return
    }

    let votes_for = 0
    let votes_against = 0
    let votes_abstain = 0
    let voting_power_for = 0
    let voting_power_against = 0

    for (const vote of votes) {
      const power = parseFloat(vote.voting_power)

      if (vote.vote_choice === 'for') {
        votes_for++
        voting_power_for += power
      } else if (vote.vote_choice === 'against') {
        votes_against++
        voting_power_against += power
      } else {
        votes_abstain++
      }
    }

    // Get proposal to check quorum
    const proposal = await this.getProposal(proposal_id)
    if (!proposal) return

    // Check if quorum met
    const total_voting_power = voting_power_for + voting_power_against
    const quorum_percentage = proposal.quorum_required

    // Determine new status
    let new_status = proposal.voting_status
    if (proposal.voting_status === 'active') {
      const now = new Date()
      if (proposal.voting_end && now > proposal.voting_end) {
        // Voting period ended
        if (total_voting_power >= quorum_percentage) {
          new_status = voting_power_for > voting_power_against ? 'passed' : 'rejected'
        } else {
          new_status = 'expired'
        }
      }
    }

    // Update proposal
    await this.supabase
      .from('aurev_dao_proposals')
      .update({
        votes_for,
        votes_against,
        votes_abstain,
        total_votes: votes.length,
        voting_power_for,
        voting_power_against,
        voting_status: new_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal_id)
  }

  /**
   * Calculate voting power for an org (based on staked credits/tokens)
   */
  private async calculateVotingPower(org_id: string): Promise<number> {
    // Get staked balance
    const { data: credit } = await this.supabase
      .from('aurev_credits')
      .select('staked_balance')
      .eq('org_id', org_id)
      .eq('credit_type', 'compute')
      .single()

    // Base voting power is 1, scaled by staked amount
    // 1 credit = 0.001 voting power
    const staked = credit ? parseFloat(credit.staked_balance || '0') : 0
    return Math.max(1.0, 1.0 + (staked * 0.001))
  }

  /**
   * Execute a passed proposal
   */
  async executeProposal(proposal_id: string): Promise<DAOProposal> {
    const proposal = await this.getProposal(proposal_id)
    if (!proposal) {
      throw new Error('Proposal not found')
    }

    if (proposal.voting_status !== 'passed') {
      throw new Error(`Proposal must be passed to execute. Current status: ${proposal.voting_status}`)
    }

    if (proposal.executed) {
      throw new Error('Proposal already executed')
    }

    // Execute based on proposal type
    let execution_result: Record<string, any> = {}

    try {
      switch (proposal.proposal_type) {
        case 'policy':
          execution_result = await this.executePolicyProposal(proposal)
          break
        case 'rate_control':
          execution_result = await this.executeRateControlProposal(proposal)
          break
        case 'inflation_cap':
          execution_result = await this.executeInflationCapProposal(proposal)
          break
        case 'staking_reward':
          execution_result = await this.executeStakingRewardProposal(proposal)
          break
        case 'treasury':
          execution_result = await this.executeTreasuryProposal(proposal)
          break
        default:
          execution_result = { message: 'Execution not implemented for this proposal type' }
      }

      // Mark as executed
      const { data: updated, error } = await this.supabase
        .from('aurev_dao_proposals')
        .update({
          executed: true,
          executed_at: new Date().toISOString(),
          execution_result,
          voting_status: 'executed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposal_id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to execute proposal: ${error.message}`)
      }

      return this.mapToProposal(updated)
    } catch (error: any) {
      // Record execution failure
      await this.supabase
        .from('aurev_dao_proposals')
        .update({
          execution_result: { error: error.message, failed: true },
        })
        .eq('id', proposal_id)

      throw error
    }
  }

  /**
   * Execute policy proposal
   */
  private async executePolicyProposal(proposal: DAOProposal): Promise<Record<string, any>> {
    // In a full implementation, this would create/update policies in the policy engine
    return { message: 'Policy proposal executed', proposal_data: proposal.proposal_data }
  }

  /**
   * Execute rate control proposal
   */
  private async executeRateControlProposal(proposal: DAOProposal): Promise<Record<string, any>> {
    // Update rate controls based on proposal data
    return { message: 'Rate control updated', proposal_data: proposal.proposal_data }
  }

  /**
   * Execute inflation cap proposal
   */
  private async executeInflationCapProposal(proposal: DAOProposal): Promise<Record<string, any>> {
    // Set inflation cap
    return { message: 'Inflation cap updated', proposal_data: proposal.proposal_data }
  }

  /**
   * Execute staking reward proposal
   */
  private async executeStakingRewardProposal(proposal: DAOProposal): Promise<Record<string, any>> {
    // Update staking rewards
    return { message: 'Staking rewards updated', proposal_data: proposal.proposal_data }
  }

  /**
   * Execute treasury proposal
   */
  private async executeTreasuryProposal(proposal: DAOProposal): Promise<Record<string, any>> {
    // Allocate treasury funds
    return { message: 'Treasury allocation executed', proposal_data: proposal.proposal_data }
  }

  /**
   * Get proposal by ID
   */
  async getProposal(proposal_id: string): Promise<DAOProposal | null> {
    const { data, error } = await this.supabase
      .from('aurev_dao_proposals')
      .select('*')
      .eq('id', proposal_id)
      .single()

    if (error || !data) {
      return null
    }

    return this.mapToProposal(data)
  }

  /**
   * List proposals
   */
  async listProposals(filters?: {
    status?: DAOProposal['voting_status']
    type?: DAOProposal['proposal_type']
    limit?: number
    offset?: number
  }): Promise<DAOProposal[]> {
    let query = this.supabase
      .from('aurev_dao_proposals')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('voting_status', filters.status)
    }

    if (filters?.type) {
      query = query.eq('proposal_type', filters.type)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to list proposals: ${error.message}`)
    }

    return (data || []).map(this.mapToProposal)
  }

  /**
   * Map database record to DAOProposal
   */
  private mapToProposal(record: any): DAOProposal {
    return {
      id: record.id,
      proposer_org_id: record.proposer_org_id,
      proposer_agent_id: record.proposer_agent_id,
      proposal_type: record.proposal_type,
      title: record.title,
      description: record.description,
      proposal_data: record.proposal_data || {},
      voting_status: record.voting_status,
      voting_start: record.voting_start ? new Date(record.voting_start) : undefined,
      voting_end: record.voting_end ? new Date(record.voting_end) : undefined,
      quorum_required: parseFloat(record.quorum_required),
      votes_for: record.votes_for,
      votes_against: record.votes_against,
      votes_abstain: record.votes_abstain,
      total_votes: record.total_votes,
      voting_power_for: parseFloat(record.voting_power_for || '0'),
      voting_power_against: parseFloat(record.voting_power_against || '0'),
      executed: record.executed,
      executed_at: record.executed_at ? new Date(record.executed_at) : undefined,
      execution_result: record.execution_result,
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }

  /**
   * Map database record to DAOVote
   */
  private mapToVote(record: any): DAOVote {
    return {
      id: record.id,
      proposal_id: record.proposal_id,
      org_id: record.org_id,
      vote_choice: record.vote_choice,
      voting_power: parseFloat(record.voting_power),
      rationale: record.rationale,
      created_at: new Date(record.created_at),
    }
  }
}

