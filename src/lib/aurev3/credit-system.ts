/**
 * AUREV Credit System
 * 
 * Economic layer for compute + model contribution
 * Credits earned for contributions, spent for API usage
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface CreditBalance {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
  lastPurchaseAt?: Date
}

export interface CreditTransaction {
  id: string
  type: 'earn' | 'spend' | 'purchase' | 'refund'
  amount: number
  balanceAfter: number
  actionType?: string
  description?: string
  createdAt: Date
}

// Credit earning rates
export const CREDIT_RATES = {
  TRAIN_LOCAL_AGENT: 5, // +5 credits per improvement
  CONTRIBUTE_GRADIENT: 10, // +10 credits per validated batch
  USE_GLOBAL_API: -1, // -1 credit per call
  DEPLOY_NEW_AGENT: -2, // -2 credits
  ACCESS_PREMIUM_MODELS: -5, // -5 credits per hour
} as const

/**
 * AUREV Credit System
 */
export class CreditSystem {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  
  /**
   * Get credit balance for organization
   */
  async getBalance(orgId: string): Promise<CreditBalance> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('aurev_credits')
      .select('*')
      .eq('org_id', orgId)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw new Error(`Failed to fetch credits: ${error.message}`)
    }
    
    if (!data) {
      // Create new credit account with zero balance
      const { data: newData, error: createError } = await supabase
        .from('aurev_credits')
        .insert({
          org_id: orgId,
          balance: 0,
          lifetime_earned: 0,
          lifetime_spent: 0,
        })
        .select()
        .single()
      
      if (createError) {
        throw new Error(`Failed to create credit account: ${createError.message}`)
      }
      
      return {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
      }
    }
    
    return {
      balance: parseFloat(data.balance?.toString() || '0'),
      lifetimeEarned: parseFloat(data.lifetime_earned?.toString() || '0'),
      lifetimeSpent: parseFloat(data.lifetime_spent?.toString() || '0'),
      lastPurchaseAt: data.last_purchase_at ? new Date(data.last_purchase_at) : undefined,
    }
  }
  
  /**
   * Earn credits for an action
   */
  async earn(
    orgId: string,
    amount: number,
    actionType: string,
    referenceId?: string,
    description?: string
  ): Promise<string> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.rpc('earn_aurev_credits', {
      p_org_id: orgId,
      p_amount: amount,
      p_action_type: actionType,
      p_reference_id: referenceId || null,
      p_description: description || null,
    })
    
    if (error) {
      throw new Error(`Failed to earn credits: ${error.message}`)
    }
    
    return data
  }
  
  /**
   * Spend credits for an action
   */
  async spend(
    orgId: string,
    amount: number,
    actionType: string,
    referenceId?: string,
    description?: string
  ): Promise<string> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.rpc('spend_aurev_credits', {
      p_org_id: orgId,
      p_amount: amount,
      p_action_type: actionType,
      p_reference_id: referenceId || null,
      p_description: description || null,
    })
    
    if (error) {
      throw new Error(`Failed to spend credits: ${error.message}`)
    }
    
    return data
  }
  
  /**
   * Check if organization has sufficient credits
   */
  async hasSufficientCredits(orgId: string, requiredAmount: number): Promise<boolean> {
    const balance = await this.getBalance(orgId)
    return balance.balance >= requiredAmount
  }
  
  /**
   * Get transaction history
   */
  async getTransactionHistory(
    orgId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<CreditTransaction[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from('aurev_credit_transactions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`)
    }
    
    return (data || []).map((t: any) => ({
      id: t.id,
      type: t.transaction_type,
      amount: parseFloat(t.amount?.toString() || '0'),
      balanceAfter: parseFloat(t.balance_after?.toString() || '0'),
      actionType: t.action_type,
      description: t.description,
      createdAt: new Date(t.created_at),
    }))
  }
  
  /**
   * Record purchase via Stripe
   */
  async recordPurchase(
    orgId: string,
    amount: number,
    stripePaymentIntentId: string
  ): Promise<string> {
    // Get or create credit account
    const balance = await this.getBalance(orgId)
    const supabase = await this.getSupabase()
    
    // Update credits with purchase
    const { data: creditData } = await supabase
      .from('aurev_credits')
      .select('id')
      .eq('org_id', orgId)
      .single()
    
    if (!creditData) {
      throw new Error('Credit account not found')
    }
    
    // Record purchase transaction
    const { data: transaction, error } = await supabase
      .from('aurev_credit_transactions')
      .insert({
        org_id: orgId,
        credit_id: creditData.id,
        transaction_type: 'purchase',
        amount,
        balance_after: balance.balance + amount,
        stripe_payment_intent_id: stripePaymentIntentId,
        description: `Credit purchase via Stripe`,
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to record purchase: ${error.message}`)
    }
    
    // Update credit balance
    await supabase
      .from('aurev_credits')
      .update({
        balance: balance.balance + amount,
        last_purchase_at: new Date().toISOString(),
        last_purchase_amount: amount,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
    
    return transaction.id
  }
}

