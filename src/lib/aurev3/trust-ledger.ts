/**
 * AUREV Trust Ledger
 * 
 * Blockchain-based verification of model contributions
 * Provides integrity & reward tracking
 */

import { getServerSupabase } from '@/lib/supabase/server'
import crypto from 'crypto'

export interface LedgerEntry {
  id: string
  nodeId: string
  orgId: string
  entryType: 'gradient_contribution' | 'model_download' | 'credit_transaction' | 'governance_vote'
  gradientId?: string
  globalModelId?: string
  creditsEarned: number
  transactionHash: string
  blockNumber?: number
  blockTimestamp?: Date
  verified: boolean
  verifiedBy?: string
  createdAt: Date
}

/**
 * Trust Ledger Handler
 * Manages blockchain-based verification of contributions
 */
export class TrustLedger {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  
  /**
   * Record entry to trust ledger
   */
  async recordEntry(
    nodeId: string,
    entryType: LedgerEntry['entryType'],
    gradientId?: string,
    globalModelId?: string,
    creditsEarned: number = 0
  ): Promise<string> {
    // Get node info
    const { data: node } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_mesh_nodes')
      .select('org_id')
      .eq('id', nodeId)
      .single()
    
    if (!node) {
      throw new Error('Node not found')
    }
    
    // Generate transaction hash
    const transactionHash = this.generateTransactionHash(
      nodeId,
      entryType,
      gradientId,
      globalModelId,
      creditsEarned
    )
    
    // Record in ledger
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_trust_ledger')
      .insert({
        node_id: nodeId,
        org_id: node.org_id,
        entry_type: entryType,
        gradient_id: gradientId || null,
        global_model_id: globalModelId || null,
        credits_earned: creditsEarned,
        transaction_hash: transactionHash,
        verified: false,
        block_timestamp: new Date().toISOString(),
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to record ledger entry: ${error.message}`)
    }
    
    // In production, submit to blockchain/L2 ledger here
    // For now, we'll mark as verified immediately
    await this.verifyEntry(data.id, 'system')
    
    return data.id
  }
  
  /**
   * Verify a ledger entry
   */
  async verifyEntry(
    entryId: string,
    verifiedBy: string
  ): Promise<void> {
    const { error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_trust_ledger')
      .update({
        verified: true,
        verified_by: verifiedBy,
      })
      .eq('id', entryId)
    
    if (error) {
      throw new Error(`Failed to verify entry: ${error.message}`)
    }
  }
  
  /**
   * Get ledger entries for a node
   */
  async getNodeEntries(
    nodeId: string,
    limit: number = 50
  ): Promise<LedgerEntry[]> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_trust_ledger')
      .select('*')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      throw new Error(`Failed to fetch ledger entries: ${error.message}`)
    }
    
    return (data || []).map(this.mapToLedgerEntry)
  }
  
  /**
   * Get ledger entries for an organization
   */
  async getOrgEntries(
    orgId: string,
    limit: number = 50
  ): Promise<LedgerEntry[]> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_trust_ledger')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit)
    
    if (error) {
      throw new Error(`Failed to fetch ledger entries: ${error.message}`)
    }
    
    return (data || []).map(this.mapToLedgerEntry)
  }
  
  /**
   * Verify transaction hash matches on-chain
   * In production, this would query the blockchain
   */
  async verifyOnChain(transactionHash: string): Promise<boolean> {
    // Check if hash exists and is verified
    const { data } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_trust_ledger')
      .select('verified')
      .eq('transaction_hash', transactionHash)
      .single()
    
    return data?.verified || false
  }
  
  /**
   * Generate transaction hash
   */
  private generateTransactionHash(
    nodeId: string,
    entryType: string,
    gradientId?: string,
    globalModelId?: string,
    creditsEarned: number = 0
  ): string {
    const timestamp = Date.now()
    const data = `${nodeId}:${entryType}:${gradientId || ''}:${globalModelId || ''}:${creditsEarned}:${timestamp}`
    return crypto.createHash('sha256').update(data).digest('hex')
  }
  
  /**
   * Map database record to LedgerEntry
   */
  private mapToLedgerEntry(record: any): LedgerEntry {
    return {
      id: record.id,
      nodeId: record.node_id,
      orgId: record.org_id,
      entryType: record.entry_type,
      gradientId: record.gradient_id,
      globalModelId: record.global_model_id,
      creditsEarned: parseFloat(record.credits_earned?.toString() || '0'),
      transactionHash: record.transaction_hash,
      blockNumber: record.block_number,
      blockTimestamp: record.block_timestamp ? new Date(record.block_timestamp) : undefined,
      verified: record.verified,
      verifiedBy: record.verified_by,
      createdAt: new Date(record.created_at),
    }
  }
}

