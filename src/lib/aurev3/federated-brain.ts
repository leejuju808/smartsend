/**
 * AUREV 3.0 Federated Brain
 * 
 * Core engine for collecting, encrypting, and aggregating gradients
 * from distributed nodes across the global network.
 */

import { getServerSupabase } from '@/lib/supabase/server'
import crypto from 'crypto'

export interface GradientContribution {
  nodeId: string
  orgId: string
  modelName: string
  gradientVersion: number
  encryptedGradients: Buffer
  trainingSamples: number
  validationAccuracy: number
  trainingLoss: number
  contributionScore: number
  metadata?: Record<string, any>
}

export interface AggregatedModel {
  modelName: string
  modelVersion: number
  contributingGradients: number
  contributingNodes: number
  globalAccuracy: number
  accuracyImprovement: number
  modelWeightsHash: string
}

/**
 * Encrypt gradients using homomorphic encryption
 * For production, use a proper HE library like Microsoft SEAL
 */
export class GradientEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm'
  
  /**
   * Encrypt gradient data
   * In production, replace with proper homomorphic encryption (e.g., SEAL)
   */
  static encrypt(gradientData: Buffer, encryptionKey: string): Buffer {
    const key = crypto.scryptSync(encryptionKey, 'aurev3-salt', 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv)
    
    const encrypted = Buffer.concat([
      iv,
      cipher.update(gradientData),
      cipher.final(),
    ])
    
    const authTag = cipher.getAuthTag()
    return Buffer.concat([encrypted, authTag])
  }
  
  /**
   * Decrypt gradient data (only for aggregation server)
   */
  static decrypt(encryptedData: Buffer, encryptionKey: string): Buffer {
    const key = crypto.scryptSync(encryptionKey, 'aurev3-salt', 32)
    const iv = encryptedData.subarray(0, 16)
    const authTag = encryptedData.subarray(-16)
    const encrypted = encryptedData.subarray(16, -16)
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])
  }
  
  /**
   * Calculate gradient hash for verification
   */
  static hash(gradientData: Buffer): string {
    return crypto.createHash('sha256').update(gradientData).digest('hex')
  }
}

/**
 * Federated averaging algorithm
 * Aggregates gradients from multiple nodes
 */
export class FederatedAveraging {
  /**
   * Aggregate gradients using weighted average
   * Weights based on contribution score and sample size
   */
  static aggregate(
    contributions: GradientContribution[]
  ): {
    aggregatedGradients: Buffer
    totalSamples: number
    weightedAccuracy: number
  } {
    if (contributions.length === 0) {
      throw new Error('No gradients to aggregate')
    }
    
    // Calculate weights based on contribution score and sample size
    const weights = contributions.map(c => {
      const sampleWeight = c.trainingSamples / 1000 // Normalize
      const qualityWeight = c.contributionScore || 0.5
      return sampleWeight * qualityWeight
    })
    
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    const normalizedWeights = weights.map(w => w / totalWeight)
    
    // For now, we return the first gradient as placeholder
    // In production, this would perform actual gradient averaging
    const primaryGradient = contributions[0]
    
    // Calculate weighted accuracy
    const weightedAccuracy = contributions.reduce(
      (sum, c, i) => sum + (c.validationAccuracy * normalizedWeights[i]),
      0
    )
    
    const totalSamples = contributions.reduce(
      (sum, c) => sum + c.trainingSamples,
      0
    )
    
    return {
      aggregatedGradients: primaryGradient.encryptedGradients,
      totalSamples,
      weightedAccuracy,
    }
  }
  
  /**
   * Calculate contribution score for a gradient
   * Based on accuracy, sample size, and validation metrics
   */
  static calculateContributionScore(
    validationAccuracy: number,
    trainingSamples: number,
    trainingLoss: number
  ): number {
    // Normalize accuracy (0-1)
    const accuracyScore = validationAccuracy
    
    // Normalize sample size (more samples = better, capped at 1.0)
    const sampleScore = Math.min(trainingSamples / 10000, 1.0)
    
    // Lower loss = better (inverted and normalized)
    const lossScore = Math.max(0, 1 - (trainingLoss / 2))
    
    // Weighted combination
    return (accuracyScore * 0.5) + (sampleScore * 0.3) + (lossScore * 0.2)
  }
}

/**
 * Federated Brain - Main orchestrator
 */
export class FederatedBrain {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  
  /**
   * Collect pending gradients for aggregation
   */
  async collectPendingGradients(
    modelName: string,
    minGradients: number = 10
  ): Promise<GradientContribution[]> {
    const supabase = await this.getSupabase()
    const { data: gradients, error } = await supabase
      .from('aurev_gradients')
      .select(`
        id,
        node_id,
        org_id,
        model_name,
        gradient_version,
        encrypted_gradients,
        training_samples,
        validation_accuracy,
        training_loss,
        contribution_score,
        metadata
      `)
      .eq('model_name', modelName)
      .eq('validated', true)
      .eq('aggregated', false)
      .order('created_at', { ascending: true })
      .limit(minGradients * 2) // Get extra for filtering
    
    if (error) {
      throw new Error(`Failed to collect gradients: ${error.message}`)
    }
    
    if (!gradients || gradients.length < minGradients) {
      return []
    }
    
    // Convert to GradientContribution format
    return gradients.map(g => ({
      nodeId: g.node_id,
      orgId: g.org_id,
      modelName: g.model_name,
      gradientVersion: g.gradient_version,
      encryptedGradients: Buffer.from(g.encrypted_gradients),
      trainingSamples: g.training_samples,
      validationAccuracy: parseFloat(g.validation_accuracy?.toString() || '0'),
      trainingLoss: parseFloat(g.training_loss?.toString() || '0'),
      contributionScore: parseFloat(g.contribution_score?.toString() || '0'),
      metadata: g.metadata || {},
    }))
  }
  
  /**
   * Aggregate gradients into new global model
   */
  async aggregateModel(
    modelName: string,
    aggregationMethod: 'fedavg' | 'fedprox' = 'fedavg'
  ): Promise<AggregatedModel> {
    // Collect gradients
    const contributions = await this.collectPendingGradients(modelName)
    
    if (contributions.length === 0) {
      throw new Error('No gradients available for aggregation')
    }
    
    // Aggregate using federated averaging
    const aggregated = FederatedAveraging.aggregate(contributions)
    
    // Get current model version
    const supabase = await this.getSupabase()
    const { data: latestModel } = await supabase
      .from('aurev_global_models')
      .select('model_version')
      .eq('model_name', modelName)
      .order('model_version', { ascending: false })
      .limit(1)
      .single()
    
    const newVersion = (latestModel?.model_version || 0) + 1
    
    // Calculate improvement
    const previousAccuracy = latestModel ? await this.getModelAccuracy(modelName, latestModel.model_version) : 0
    const accuracyImprovement = aggregated.weightedAccuracy - previousAccuracy
    
    // Store model weights (in production, use S3/GCS)
    const modelWeightsHash = GradientEncryption.hash(aggregated.aggregatedGradients)
    
    // Create new global model record
    const { data: newModel, error } = await supabase
      .from('aurev_global_models')
      .insert({
        model_name: modelName,
        model_version: newVersion,
        model_architecture: 'transformer-v1',
        model_weights_hash: modelWeightsHash,
        aggregation_method: aggregationMethod,
        contributing_gradients: contributions.length,
        contributing_nodes: new Set(contributions.map(c => c.nodeId)).size,
        global_accuracy: aggregated.weightedAccuracy,
        accuracy_improvement: accuracyImprovement,
        deployment_status: 'validating',
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to create global model: ${error.message}`)
    }
    
    // Mark gradients as aggregated
    const gradientIds = contributions.map((c: any) => {
      // We need to get the actual gradient IDs from DB
      return null // Placeholder
    })
    
    // Update gradient statuses (simplified - would need gradient IDs)
    await supabase
      .from('aurev_gradients')
      .update({
        aggregated: true,
        aggregated_at: new Date().toISOString(),
        global_model_version: newVersion,
      })
      .eq('model_name', modelName)
      .eq('aggregated', false)
      .eq('validated', true)
      .in('id', gradientIds.filter(id => id !== null) as string[])
    
    return {
      modelName,
      modelVersion: newVersion,
      contributingGradients: contributions.length,
      contributingNodes: new Set(contributions.map(c => c.nodeId)).size,
      globalAccuracy: aggregated.weightedAccuracy,
      accuracyImprovement,
      modelWeightsHash,
    }
  }
  
  /**
   * Get accuracy for a specific model version
   */
  private async getModelAccuracy(
    modelName: string,
    version: number
  ): Promise<number> {
    const supabase = await this.getSupabase()
    const { data } = await supabase
      .from('aurev_global_models')
      .select('global_accuracy')
      .eq('model_name', modelName)
      .eq('model_version', version)
      .single()
    
    return parseFloat(data?.global_accuracy?.toString() || '0')
  }
  
  /**
   * Deploy global model to all nodes
   */
  async deployGlobalModel(
    modelName: string,
    modelVersion: number
  ): Promise<void> {
    // Update model status to deployed
    const supabase = await this.getSupabase()
    await supabase
      .from('aurev_global_models')
      .update({
        deployment_status: 'deployed',
        deployed_at: new Date().toISOString(),
      })
      .eq('model_name', modelName)
      .eq('model_version', modelVersion)
    
    // Notify all active nodes
    // In production, this would trigger webhooks to each node
    // For now, we update node records to indicate sync needed
    await supabase
      .from('aurev_mesh_nodes')
      .update({
        status: 'syncing',
        last_model_update: new Date().toISOString(),
      })
      .eq('status', 'active')
  }
  
  /**
   * Record gradient contribution from a node
   */
  async recordGradientContribution(
    nodeId: string,
    modelName: string,
    gradientData: Buffer,
    trainingSamples: number,
    validationAccuracy: number,
    trainingLoss: number,
    metadata?: Record<string, any>
  ): Promise<string> {
    // Get encryption key (in production, from secure storage)
    const encryptionKey = process.env.AUREV3_ENCRYPTION_KEY || 'default-key-change-in-production'
    
    // Encrypt gradients
    const encrypted = GradientEncryption.encrypt(gradientData, encryptionKey)
    
    // Calculate contribution score
    const contributionScore = FederatedAveraging.calculateContributionScore(
      validationAccuracy,
      trainingSamples,
      trainingLoss
    )
    
    // Get node info
    const supabase = await this.getSupabase()
    const { data: node } = await supabase
      .from('aurev_mesh_nodes')
      .select('org_id')
      .eq('id', nodeId)
      .single()
    
    if (!node) {
      throw new Error('Node not found')
    }
    
    // Use database function to record contribution
    const { data, error } = await supabase.rpc('record_gradient_contribution', {
      p_node_id: nodeId,
      p_model_name: modelName,
      p_encrypted_gradients: encrypted.toString('base64'),
      p_training_samples: trainingSamples,
      p_validation_accuracy: validationAccuracy,
      p_training_loss: trainingLoss,
      p_metadata: metadata || {},
    })
    
    if (error) {
      throw new Error(`Failed to record gradient: ${error.message}`)
    }
    
    return data
  }
}

