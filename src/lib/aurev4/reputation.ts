/**
 * AUREV Reputation Graph System
 * 
 * Tracks and calculates reputation scores for AI agents and organizations
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface Reputation {
  id: string
  entity_type: 'agent' | 'org' | 'service' | 'model'
  entity_id: string
  org_id?: string
  reputation_score: number
  transaction_count: number
  successful_transactions: number
  failed_transactions: number
  total_value_traded: number
  average_delivery_time_seconds?: number
  quality_rating: number
  reliability_rating: number
  speed_rating: number
  verified: boolean
  verification_level?: 'unverified' | 'basic' | 'verified' | 'premium' | 'enterprise'
  last_transaction_at?: Date
  created_at: Date
  updated_at: Date
}

export interface ReputationEvent {
  id: string
  reputation_id: string
  contract_id?: string
  event_type: 'transaction_success' | 'transaction_failure' | 'dispute' | 'verification' | 'rating_update'
  score_delta: number
  reason?: string
  metadata: Record<string, any>
  created_at: Date
}

/**
 * Reputation Graph Engine
 */
export class AUREVReputation {
  private supabase = getServerSupabase()

  /**
   * Get reputation for an entity
   */
  async getReputation(
    entity_type: Reputation['entity_type'],
    entity_id: string
  ): Promise<Reputation | null> {
    const { data, error } = await this.supabase
      .from('aurev_reputation')
      .select('*')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .single()

    if (error || !data) {
      return null
    }

    return this.mapToReputation(data)
  }

  /**
   * Get or create reputation for an entity
   */
  async getOrCreateReputation(
    entity_type: Reputation['entity_type'],
    entity_id: string,
    org_id?: string
  ): Promise<Reputation> {
    let reputation = await this.getReputation(entity_type, entity_id)

    if (!reputation) {
      // Create new reputation record
      const { data, error } = await this.supabase
        .from('aurev_reputation')
        .insert({
          entity_type,
          entity_id,
          org_id: org_id || null,
          reputation_score: 100.0,
          transaction_count: 0,
          successful_transactions: 0,
          failed_transactions: 0,
          total_value_traded: 0,
          quality_rating: 0.0,
          reliability_rating: 0.0,
          speed_rating: 0.0,
          verified: false,
          verification_level: 'unverified',
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create reputation: ${error.message}`)
      }

      reputation = this.mapToReputation(data)
    }

    return reputation
  }

  /**
   * Update reputation after transaction
   */
  async recordTransaction(
    entity_type: Reputation['entity_type'],
    entity_id: string,
    success: boolean,
    value: number,
    delivery_time_seconds?: number,
    contract_id?: string,
    org_id?: string
  ): Promise<Reputation> {
    // Get or create reputation
    const reputation = await this.getOrCreateReputation(entity_type, entity_id, org_id)

    // Calculate new metrics
    const new_transaction_count = reputation.transaction_count + 1
    const new_successful = success ? reputation.successful_transactions + 1 : reputation.successful_transactions
    const new_failed = success ? reputation.failed_transactions : reputation.failed_transactions + 1
    const new_total_value = reputation.total_value_traded + value

    // Calculate success rate
    const success_rate = new_transaction_count > 0 ? (new_successful / new_transaction_count) * 100 : 0

    // Calculate average delivery time
    let avg_delivery_time = reputation.average_delivery_time_seconds
    if (delivery_time_seconds !== undefined) {
      if (avg_delivery_time === null || avg_delivery_time === undefined) {
        avg_delivery_time = delivery_time_seconds
      } else {
        avg_delivery_time = Math.floor(
          (avg_delivery_time * reputation.transaction_count + delivery_time_seconds) / new_transaction_count
        )
      }
    }

    // Calculate new reputation score
    const new_score = this.calculateReputationScore(
      new_transaction_count,
      success_rate,
      new_total_value
    )

    // Score delta for event
    const score_delta = success ? 5.0 : -10.0

    // Update reputation
    const { data: updated, error: updateError } = await this.supabase
      .from('aurev_reputation')
      .update({
        reputation_score: new_score,
        transaction_count: new_transaction_count,
        successful_transactions: new_successful,
        failed_transactions: new_failed,
        total_value_traded: new_total_value,
        average_delivery_time_seconds: avg_delivery_time,
        last_transaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reputation.id)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to update reputation: ${updateError.message}`)
    }

    // Record reputation event
    await this.supabase
      .from('aurev_reputation_events')
      .insert({
        reputation_id: reputation.id,
        contract_id: contract_id || null,
        event_type: success ? 'transaction_success' : 'transaction_failure',
        score_delta,
        reason: success ? 'Successful transaction' : 'Failed transaction',
      })

    return this.mapToReputation(updated)
  }

  /**
   * Update ratings (quality, reliability, speed)
   */
  async updateRatings(
    entity_type: Reputation['entity_type'],
    entity_id: string,
    ratings: {
      quality?: number
      reliability?: number
      speed?: number
    }
  ): Promise<Reputation> {
    const reputation = await this.getOrCreateReputation(entity_type, entity_id)

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (ratings.quality !== undefined) {
      updateData.quality_rating = Math.max(0, Math.min(5, ratings.quality))
    }

    if (ratings.reliability !== undefined) {
      updateData.reliability_rating = Math.max(0, Math.min(5, ratings.reliability))
    }

    if (ratings.speed !== undefined) {
      updateData.speed_rating = Math.max(0, Math.min(5, ratings.speed))
    }

    const { data: updated, error } = await this.supabase
      .from('aurev_reputation')
      .update(updateData)
      .eq('id', reputation.id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update ratings: ${error.message}`)
    }

    // Record rating update event
    await this.supabase
      .from('aurev_reputation_events')
      .insert({
        reputation_id: reputation.id,
        event_type: 'rating_update',
        score_delta: 0,
        metadata: ratings,
      })

    return this.mapToReputation(updated)
  }

  /**
   * Verify an entity
   */
  async verifyEntity(
    entity_type: Reputation['entity_type'],
    entity_id: string,
    verification_level: 'basic' | 'verified' | 'premium' | 'enterprise'
  ): Promise<Reputation> {
    const reputation = await this.getOrCreateReputation(entity_type, entity_id)

    // Bonus score for verification
    const verification_bonus: Record<string, number> = {
      basic: 10,
      verified: 25,
      premium: 50,
      enterprise: 100,
    }

    const new_score = Math.min(1000, reputation.reputation_score + (verification_bonus[verification_level] || 0))

    const { data: updated, error } = await this.supabase
      .from('aurev_reputation')
      .update({
        verified: true,
        verification_level,
        reputation_score: new_score,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reputation.id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to verify entity: ${error.message}`)
    }

    // Record verification event
    await this.supabase
      .from('aurev_reputation_events')
      .insert({
        reputation_id: reputation.id,
        event_type: 'verification',
        score_delta: verification_bonus[verification_level] || 0,
        reason: `Verified as ${verification_level}`,
      })

    return this.mapToReputation(updated)
  }

  /**
   * Get reputation events for an entity
   */
  async getReputationEvents(
    entity_type: Reputation['entity_type'],
    entity_id: string,
    limit: number = 50
  ): Promise<ReputationEvent[]> {
    // First get reputation ID
    const reputation = await this.getReputation(entity_type, entity_id)
    if (!reputation) {
      return []
    }

    const { data, error } = await this.supabase
      .from('aurev_reputation_events')
      .select('*')
      .eq('reputation_id', reputation.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get reputation events: ${error.message}`)
    }

    return (data || []).map(this.mapToReputationEvent)
  }

  /**
   * Get top reputations by score
   */
  async getTopReputations(
    entity_type?: Reputation['entity_type'],
    limit: number = 100
  ): Promise<Reputation[]> {
    let query = this.supabase
      .from('aurev_reputation')
      .select('*')
      .order('reputation_score', { ascending: false })
      .limit(limit)

    if (entity_type) {
      query = query.eq('entity_type', entity_type)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to get top reputations: ${error.message}`)
    }

    return (data || []).map(this.mapToReputation)
  }

  /**
   * Calculate reputation score from metrics
   */
  private calculateReputationScore(
    transaction_count: number,
    success_rate: number,
    total_value: number
  ): number {
    // Base score: 100
    // Transaction count bonus: up to +300
    // Success rate bonus: up to +300
    // Value bonus: up to +300
    const base = 100.0
    const transaction_bonus = Math.min(300, transaction_count * 2.0)
    const success_bonus = Math.min(300, success_rate * 3.0)
    const value_bonus = Math.min(300, Math.log(Math.max(1, total_value)) * 50.0)

    return Math.min(1000, base + transaction_bonus + success_bonus + value_bonus)
  }

  /**
   * Map database record to Reputation
   */
  private mapToReputation(record: any): Reputation {
    return {
      id: record.id,
      entity_type: record.entity_type,
      entity_id: record.entity_id,
      org_id: record.org_id,
      reputation_score: parseFloat(record.reputation_score),
      transaction_count: record.transaction_count,
      successful_transactions: record.successful_transactions,
      failed_transactions: record.failed_transactions,
      total_value_traded: parseFloat(record.total_value_traded || '0'),
      average_delivery_time_seconds: record.average_delivery_time_seconds,
      quality_rating: parseFloat(record.quality_rating || '0'),
      reliability_rating: parseFloat(record.reliability_rating || '0'),
      speed_rating: parseFloat(record.speed_rating || '0'),
      verified: record.verified,
      verification_level: record.verification_level,
      last_transaction_at: record.last_transaction_at ? new Date(record.last_transaction_at) : undefined,
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }

  /**
   * Map database record to ReputationEvent
   */
  private mapToReputationEvent(record: any): ReputationEvent {
    return {
      id: record.id,
      reputation_id: record.reputation_id,
      contract_id: record.contract_id,
      event_type: record.event_type,
      score_delta: parseFloat(record.score_delta),
      reason: record.reason,
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
    }
  }
}

