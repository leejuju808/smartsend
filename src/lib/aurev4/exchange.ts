/**
 * AUREV Exchange - Transaction Protocol Engine
 * 
 * Enables AI-to-AI autonomous commerce with smart contracts and atomic settlement
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface SmartContract {
  id: string
  org_id: string
  buyer_agent_id?: string
  seller_agent_id?: string
  contract_type: 'service' | 'compute' | 'data' | 'model' | 'insight'
  service_name: string
  service_description?: string
  price_per_unit: number
  units: number
  total_value: number
  currency: 'AUREV_CREDIT' | 'AUREV_TOKEN' | 'USD'
  escrow_enabled: boolean
  escrow_balance: number
  settlement_status: 'pending' | 'escrowed' | 'delivered' | 'verified' | 'settled' | 'disputed' | 'cancelled'
  delivery_deadline?: Date
  delivered_at?: Date
  verification_hash?: string
  contract_terms: Record<string, any>
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface Settlement {
  id: string
  contract_id: string
  org_id: string
  settlement_method: 'stripe' | 'l2_chain' | 'hybrid' | 'internal_credit'
  settlement_provider?: string
  transaction_hash?: string
  stripe_payment_intent_id?: string
  transaction_amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
  failure_reason?: string
  metadata: Record<string, any>
  created_at: Date
  completed_at?: Date
}

export interface CreateContractRequest {
  org_id: string
  buyer_agent_id?: string
  seller_agent_id?: string
  contract_type: SmartContract['contract_type']
  service_name: string
  service_description?: string
  price_per_unit: number
  units: number
  currency?: SmartContract['currency']
  escrow_enabled?: boolean
  delivery_deadline?: Date
  contract_terms?: Record<string, any>
  metadata?: Record<string, any>
}

export interface SettlementRequest {
  contract_id: string
  org_id: string
  settlement_method: Settlement['settlement_method']
  settlement_provider?: string
}

/**
 * AUREV Exchange Engine
 */
export class AUREVExchange {
  private supabase = getServerSupabase()

  /**
   * Create a new smart contract
   */
  async createContract(request: CreateContractRequest): Promise<SmartContract> {
    const {
      org_id,
      buyer_agent_id,
      seller_agent_id,
      contract_type,
      service_name,
      service_description,
      price_per_unit,
      units,
      currency = 'AUREV_CREDIT',
      escrow_enabled = true,
      delivery_deadline,
      contract_terms = {},
      metadata = {},
    } = request

    const total_value = price_per_unit * units

    // Create contract
    const { data, error } = await this.supabase
      .from('aurev_smart_contracts')
      .insert({
        org_id,
        buyer_agent_id: buyer_agent_id || null,
        seller_agent_id: seller_agent_id || null,
        contract_type,
        service_name,
        service_description: service_description || null,
        price_per_unit,
        units,
        total_value,
        currency,
        escrow_enabled,
        escrow_balance: escrow_enabled ? total_value : 0,
        settlement_status: escrow_enabled ? 'pending' : 'pending',
        delivery_deadline: delivery_deadline?.toISOString() || null,
        contract_terms,
        metadata,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create contract: ${error.message}`)
    }

    // If escrow enabled, lock buyer's credits
    if (escrow_enabled && currency === 'AUREV_CREDIT') {
      await this.lockCreditsForEscrow(org_id, total_value, data.id)
    }

    return this.mapToContract(data)
  }

  /**
   * Lock credits for escrow
   */
  private async lockCreditsForEscrow(
    org_id: string,
    amount: number,
    contract_id: string
  ): Promise<void> {
    // Get or create credit account
    const { data: credit } = await this.supabase
      .from('aurev_credits')
      .select('credit_balance')
      .eq('org_id', org_id)
      .eq('credit_type', 'compute')
      .single()

    if (!credit) {
      throw new Error('No credit account found for organization')
    }

    if (credit.credit_balance < amount) {
      throw new Error(`Insufficient credits. Required: ${amount}, Available: ${credit.credit_balance}`)
    }

    // Deduct from balance (escrow = locked)
    const new_balance = credit.credit_balance - amount

    const { error: updateError } = await this.supabase
      .from('aurev_credits')
      .update({ credit_balance: new_balance })
      .eq('org_id', org_id)
      .eq('credit_type', 'compute')

    if (updateError) {
      throw new Error(`Failed to lock credits: ${updateError.message}`)
    }

    // Record transaction
    await this.supabase
      .from('aurev_credit_transactions')
      .insert({
        org_id,
        transaction_type: 'consume',
        amount: -amount,
        balance_before: credit.credit_balance,
        balance_after: new_balance,
        contract_id,
        description: `Escrow lock for contract ${contract_id}`,
      })
  }

  /**
   * Update contract status
   */
  async updateContractStatus(
    contract_id: string,
    status: SmartContract['settlement_status'],
    verification_hash?: string
  ): Promise<SmartContract> {
    const updateData: any = {
      settlement_status: status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
    }

    if (verification_hash) {
      updateData.verification_hash = verification_hash
    }

    const { data, error } = await this.supabase
      .from('aurev_smart_contracts')
      .update(updateData)
      .eq('id', contract_id)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update contract: ${error.message}`)
    }

    return this.mapToContract(data)
  }

  /**
   * Settle a contract (atomic settlement)
   */
  async settleContract(request: SettlementRequest): Promise<Settlement> {
    const { contract_id, org_id, settlement_method, settlement_provider } = request

    // Get contract
    const { data: contract, error: contractError } = await this.supabase
      .from('aurev_smart_contracts')
      .select('*')
      .eq('id', contract_id)
      .eq('org_id', org_id)
      .single()

    if (contractError || !contract) {
      throw new Error(`Contract not found: ${contract_id}`)
    }

    if (contract.settlement_status !== 'delivered' && contract.settlement_status !== 'verified') {
      throw new Error(`Contract must be delivered or verified before settlement. Current status: ${contract.settlement_status}`)
    }

    // Create settlement record
    const { data: settlement, error: settlementError } = await this.supabase
      .from('aurev_settlements')
      .insert({
        contract_id,
        org_id,
        settlement_method,
        settlement_provider: settlement_provider || null,
        transaction_amount: contract.total_value,
        currency: contract.currency,
        status: 'processing',
      })
      .select()
      .single()

    if (settlementError) {
      throw new Error(`Failed to create settlement: ${settlementError.message}`)
    }

    // Process settlement based on method
    try {
      if (settlement_method === 'internal_credit' || contract.currency === 'AUREV_CREDIT') {
        await this.settleInternalCredits(contract, settlement.id)
      } else if (settlement_method === 'stripe') {
        await this.settleStripe(contract, settlement.id)
      } else if (settlement_method === 'l2_chain') {
        await this.settleL2Chain(contract, settlement.id, settlement_provider)
      } else if (settlement_method === 'hybrid') {
        // Split between Stripe and L2
        await this.settleHybrid(contract, settlement.id, settlement_provider)
      }

      // Update settlement status
      await this.supabase
        .from('aurev_settlements')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', settlement.id)

      // Update contract status
      await this.updateContractStatus(contract_id, 'settled')

      // Release escrow to seller
      if (contract.escrow_enabled) {
        await this.releaseEscrowToSeller(contract)
      }

      // Update reputation
      const delivery_time = contract.delivered_at && contract.created_at
        ? Math.floor((new Date(contract.delivered_at).getTime() - new Date(contract.created_at).getTime()) / 1000)
        : null

      await this.supabase.rpc('update_reputation_after_transaction', {
        p_contract_id: contract_id,
        p_success: true,
        p_delivery_time_seconds: delivery_time,
      })

      return this.mapToSettlement(settlement)
    } catch (error: any) {
      // Mark settlement as failed
      await this.supabase
        .from('aurev_settlements')
        .update({
          status: 'failed',
          failure_reason: error.message,
        })
        .eq('id', settlement.id)

      throw error
    }
  }

  /**
   * Settle using internal credits
   */
  private async settleInternalCredits(contract: any, settlement_id: string): Promise<void> {
    // Transfer credits from buyer to seller (escrow already locked)
    // The escrow release will handle the actual transfer
    // This is just a marker that settlement is complete
  }

  /**
   * Settle via Stripe
   */
  private async settleStripe(contract: any, settlement_id: string): Promise<void> {
    // In a full implementation, this would create a Stripe Payment Intent
    // For now, we'll just mark it as processed
    // TODO: Integrate with Stripe API
  }

  /**
   * Settle on L2 Chain
   */
  private async settleL2Chain(contract: any, settlement_id: string, provider?: string): Promise<void> {
    // In a full implementation, this would submit a transaction to L2
    // For now, we'll just mark it as processed
    // TODO: Integrate with L2 provider (Polygon, Arbitrum, Base, etc.)
  }

  /**
   * Settle hybrid (Stripe + L2)
   */
  private async settleHybrid(contract: any, settlement_id: string, provider?: string): Promise<void> {
    // Split settlement between fiat (Stripe) and on-chain (L2)
    // For now, mark as processed
    // TODO: Implement hybrid settlement logic
  }

  /**
   * Release escrow to seller
   */
  private async releaseEscrowToSeller(contract: any): Promise<void> {
    if (!contract.seller_agent_id && !contract.org_id) {
      return
    }

    // Get seller's org (could be from agent or direct org)
    const seller_org_id = contract.org_id // Simplified - in reality would resolve from agent

    // Add credits to seller
    const { data: sellerCredit } = await this.supabase
      .from('aurev_credits')
      .select('credit_balance')
      .eq('org_id', seller_org_id)
      .eq('credit_type', 'compute')
      .single()

    if (!sellerCredit) {
      // Create credit account if doesn't exist
      await this.supabase
        .from('aurev_credits')
        .insert({
          org_id: seller_org_id,
          credit_type: 'compute',
          credit_balance: contract.total_value,
        })
    } else {
      await this.supabase
        .from('aurev_credits')
        .update({
          credit_balance: sellerCredit.credit_balance + contract.total_value,
        })
        .eq('org_id', seller_org_id)
        .eq('credit_type', 'compute')
    }

    // Record transaction
    await this.supabase
      .from('aurev_credit_transactions')
      .insert({
        org_id: seller_org_id,
        transaction_type: 'reward',
        amount: contract.total_value,
        balance_before: sellerCredit?.credit_balance || 0,
        balance_after: (sellerCredit?.credit_balance || 0) + contract.total_value,
        contract_id: contract.id,
        description: `Payment for contract ${contract.id}`,
      })
  }

  /**
   * Get contract by ID
   */
  async getContract(contract_id: string, org_id?: string): Promise<SmartContract | null> {
    let query = this.supabase
      .from('aurev_smart_contracts')
      .select('*')
      .eq('id', contract_id)

    if (org_id) {
      query = query.eq('org_id', org_id)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return null
    }

    return this.mapToContract(data)
  }

  /**
   * List contracts for an organization
   */
  async listContracts(
    org_id: string,
    filters?: {
      status?: SmartContract['settlement_status']
      type?: SmartContract['contract_type']
      buyer_agent_id?: string
      seller_agent_id?: string
      limit?: number
      offset?: number
    }
  ): Promise<SmartContract[]> {
    let query = this.supabase
      .from('aurev_smart_contracts')
      .select('*')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('settlement_status', filters.status)
    }

    if (filters?.type) {
      query = query.eq('contract_type', filters.type)
    }

    if (filters?.buyer_agent_id) {
      query = query.eq('buyer_agent_id', filters.buyer_agent_id)
    }

    if (filters?.seller_agent_id) {
      query = query.eq('seller_agent_id', filters.seller_agent_id)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to list contracts: ${error.message}`)
    }

    return (data || []).map(this.mapToContract)
  }

  /**
   * Map database record to SmartContract
   */
  private mapToContract(record: any): SmartContract {
    return {
      id: record.id,
      org_id: record.org_id,
      buyer_agent_id: record.buyer_agent_id,
      seller_agent_id: record.seller_agent_id,
      contract_type: record.contract_type,
      service_name: record.service_name,
      service_description: record.service_description,
      price_per_unit: parseFloat(record.price_per_unit),
      units: record.units,
      total_value: parseFloat(record.total_value),
      currency: record.currency,
      escrow_enabled: record.escrow_enabled,
      escrow_balance: parseFloat(record.escrow_balance || '0'),
      settlement_status: record.settlement_status,
      delivery_deadline: record.delivery_deadline ? new Date(record.delivery_deadline) : undefined,
      delivered_at: record.delivered_at ? new Date(record.delivered_at) : undefined,
      verification_hash: record.verification_hash,
      contract_terms: record.contract_terms || {},
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }

  /**
   * Map database record to Settlement
   */
  private mapToSettlement(record: any): Settlement {
    return {
      id: record.id,
      contract_id: record.contract_id,
      org_id: record.org_id,
      settlement_method: record.settlement_method,
      settlement_provider: record.settlement_provider,
      transaction_hash: record.transaction_hash,
      stripe_payment_intent_id: record.stripe_payment_intent_id,
      transaction_amount: parseFloat(record.transaction_amount),
      currency: record.currency,
      status: record.status,
      failure_reason: record.failure_reason,
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      completed_at: record.completed_at ? new Date(record.completed_at) : undefined,
    }
  }
}

