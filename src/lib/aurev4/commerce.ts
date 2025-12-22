/**
 * AUREV AI Commerce Framework
 * 
 * Autonomous market makers, service bidding, and cognitive licensing
 */

import { getServerSupabase } from '@/lib/supabase/server'
import { AUREVExchange } from './exchange'

export interface ServiceListing {
  id: string
  org_id: string
  seller_agent_id?: string
  service_name: string
  service_type: 'api' | 'automation' | 'workflow' | 'data_enrichment' | 'ai_model' | 'insight'
  service_description: string
  service_category?: string
  price_per_unit: number
  unit_type: string
  min_units: number
  max_units?: number
  available: boolean
  total_capacity?: number
  used_capacity: number
  avg_delivery_time_seconds?: number
  success_rate?: number
  api_endpoint?: string
  documentation_url?: string
  tags: string[]
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface ComputeListing {
  id: string
  org_id: string
  node_id?: string
  compute_type: 'cpu' | 'gpu' | 'memory' | 'storage' | 'bandwidth'
  compute_specs: Record<string, any>
  price_per_hour: number
  price_per_minute?: number
  region?: string
  available: boolean
  total_capacity?: number
  used_capacity: number
  uptime_percentage?: number
  avg_latency_ms?: number
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface ModelListing {
  id: string
  org_id: string
  model_name: string
  model_type: 'llm' | 'embedding' | 'classifier' | 'regressor' | 'custom'
  base_model?: string
  fine_tuned_for?: string
  model_version?: string
  license_type: 'usage' | 'time_based' | 'task_based' | 'royalty'
  price_per_use?: number
  price_per_hour?: number
  price_per_task?: number
  royalty_percentage?: number
  model_size_mb?: number
  parameters_count?: number
  training_data_size?: number
  accuracy_score?: number
  latency_ms?: number
  throughput_rps?: number
  available: boolean
  endpoint_url?: string
  api_key_required: boolean
  documentation_url?: string
  tags: string[]
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface InsightListing {
  id: string
  org_id: string
  insight_name: string
  insight_type: 'forecast' | 'signal' | 'pattern' | 'recommendation' | 'analysis'
  description: string
  data_source?: string
  time_range?: string
  price_per_access?: number
  subscription_price?: number
  sample_data?: Record<string, any>
  accuracy_score?: number
  confidence_level?: number
  update_frequency?: string
  available: boolean
  access_method?: 'api' | 'webhook' | 'download' | 'stream'
  endpoint_url?: string
  tags: string[]
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

export interface MarketMaker {
  id: string
  service_listing_id?: string
  compute_listing_id?: string
  model_listing_id?: string
  insight_listing_id?: string
  algorithm_type: 'fixed' | 'dynamic' | 'auction' | 'ai_optimized'
  base_price: number
  current_price: number
  demand_factor: number
  supply_factor: number
  last_price_update?: Date
  pricing_model: Record<string, any>
  metadata: Record<string, any>
  created_at: Date
  updated_at: Date
}

/**
 * AI Commerce Framework
 */
export class AUREVCommerce {
  private supabase = getServerSupabase()
  private exchange: AUREVExchange

  constructor() {
    this.exchange = new AUREVExchange()
  }

  /**
   * List available services (marketplace query)
   */
  async searchServices(filters: {
    service_type?: ServiceListing['service_type']
    category?: string
    tags?: string[]
    max_price?: number
    min_success_rate?: number
    available_only?: boolean
    limit?: number
    offset?: number
  }): Promise<ServiceListing[]> {
    let query = this.supabase
      .from('aurev_service_listings')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.available_only !== false) {
      query = query.eq('available', true)
    }

    if (filters.service_type) {
      query = query.eq('service_type', filters.service_type)
    }

    if (filters.category) {
      query = query.eq('service_category', filters.category)
    }

    if (filters.max_price) {
      query = query.lte('price_per_unit', filters.max_price)
    }

    if (filters.min_success_rate) {
      query = query.gte('success_rate', filters.min_success_rate)
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags)
    }

    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to search services: ${error.message}`)
    }

    return (data || []).map(this.mapToServiceListing)
  }

  /**
   * Purchase a service (creates smart contract)
   */
  async purchaseService(request: {
    org_id: string
    buyer_agent_id?: string
    service_listing_id: string
    units: number
  }): Promise<string> {
    // Get service listing
    const { data: listing, error: listingError } = await this.supabase
      .from('aurev_service_listings')
      .select('*')
      .eq('id', request.service_listing_id)
      .eq('available', true)
      .single()

    if (listingError || !listing) {
      throw new Error('Service listing not found or unavailable')
    }

    if (request.units < listing.min_units) {
      throw new Error(`Minimum units required: ${listing.min_units}`)
    }

    if (listing.max_units && request.units > listing.max_units) {
      throw new Error(`Maximum units allowed: ${listing.max_units}`)
    }

    if (listing.total_capacity && (listing.used_capacity + request.units) > listing.total_capacity) {
      throw new Error('Insufficient capacity')
    }

    // Get market maker pricing
    const current_price = await this.getMarketPrice(listing.id, 'service')

    // Create smart contract
    const contract = await this.exchange.createContract({
      org_id: request.org_id,
      buyer_agent_id: request.buyer_agent_id,
      seller_agent_id: listing.seller_agent_id || undefined,
      contract_type: 'service',
      service_name: listing.service_name,
      service_description: listing.service_description,
      price_per_unit: current_price,
      units: request.units,
      currency: 'AUREV_CREDIT',
      escrow_enabled: true,
      contract_terms: {
        service_type: listing.service_type,
        api_endpoint: listing.api_endpoint,
        expected_delivery_time_seconds: listing.avg_delivery_time_seconds,
      },
    })

    // Update listing capacity
    await this.supabase
      .from('aurev_service_listings')
      .update({ used_capacity: listing.used_capacity + request.units })
      .eq('id', listing.id)

    return contract.id
  }

  /**
   * Get market price (from market maker)
   */
  async getMarketPrice(listing_id: string, listing_type: 'service' | 'compute' | 'model' | 'insight'): Promise<number> {
    // Get market maker
    const { data: marketMaker } = await this.supabase
      .from('aurev_market_makers')
      .select('*')
      .eq(`${listing_type}_listing_id`, listing_id)
      .single()

    if (marketMaker) {
      return parseFloat(marketMaker.current_price)
    }

    // Fallback to base price from listing
    const table_map = {
      service: 'aurev_service_listings',
      compute: 'aurev_compute_listings',
      model: 'aurev_model_listings',
      insight: 'aurev_insight_listings',
    }

    const { data: listing } = await this.supabase
      .from(table_map[listing_type])
      .select('price_per_unit, price_per_hour, price_per_access')
      .eq('id', listing_id)
      .single()

    if (!listing) {
      throw new Error('Listing not found')
    }

    return parseFloat(listing.price_per_unit || listing.price_per_hour || listing.price_per_access || '0')
  }

  /**
   * Update market maker pricing (AI-optimized pricing)
   */
  async updateMarketMakerPrice(
    market_maker_id: string,
    demand_factor: number,
    supply_factor: number
  ): Promise<MarketMaker> {
    const { data: marketMaker, error: fetchError } = await this.supabase
      .from('aurev_market_makers')
      .select('*')
      .eq('id', market_maker_id)
      .single()

    if (fetchError || !marketMaker) {
      throw new Error('Market maker not found')
    }

    // Calculate new price based on algorithm
    let new_price = parseFloat(marketMaker.base_price)

    if (marketMaker.algorithm_type === 'dynamic') {
      // Simple supply/demand model
      new_price = parseFloat(marketMaker.base_price) * demand_factor / supply_factor
    } else if (marketMaker.algorithm_type === 'ai_optimized') {
      // More sophisticated AI model would go here
      // For now, use weighted average of base price and market factors
      new_price = parseFloat(marketMaker.base_price) * (0.7 + 0.3 * (demand_factor / supply_factor))
    }

    // Update market maker
    const { data: updated, error: updateError } = await this.supabase
      .from('aurev_market_makers')
      .update({
        current_price: new_price,
        demand_factor,
        supply_factor,
        last_price_update: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', market_maker_id)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to update market maker: ${updateError.message}`)
    }

    return this.mapToMarketMaker(updated)
  }

  /**
   * Search compute listings
   */
  async searchCompute(filters: {
    compute_type?: ComputeListing['compute_type']
    region?: string
    max_price_per_hour?: number
    min_uptime?: number
    available_only?: boolean
    limit?: number
  }): Promise<ComputeListing[]> {
    let query = this.supabase
      .from('aurev_compute_listings')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.available_only !== false) {
      query = query.eq('available', true)
    }

    if (filters.compute_type) {
      query = query.eq('compute_type', filters.compute_type)
    }

    if (filters.region) {
      query = query.eq('region', filters.region)
    }

    if (filters.max_price_per_hour) {
      query = query.lte('price_per_hour', filters.max_price_per_hour)
    }

    if (filters.min_uptime) {
      query = query.gte('uptime_percentage', filters.min_uptime)
    }

    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to search compute: ${error.message}`)
    }

    return (data || []).map(this.mapToComputeListing)
  }

  /**
   * Search model listings
   */
  async searchModels(filters: {
    model_type?: ModelListing['model_type']
    base_model?: string
    fine_tuned_for?: string
    max_price?: number
    min_accuracy?: number
    available_only?: boolean
    limit?: number
  }): Promise<ModelListing[]> {
    let query = this.supabase
      .from('aurev_model_listings')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.available_only !== false) {
      query = query.eq('available', true)
    }

    if (filters.model_type) {
      query = query.eq('model_type', filters.model_type)
    }

    if (filters.base_model) {
      query = query.eq('base_model', filters.base_model)
    }

    if (filters.fine_tuned_for) {
      query = query.ilike('fine_tuned_for', `%${filters.fine_tuned_for}%`)
    }

    if (filters.max_price) {
      query = query.or(`price_per_use.lte.${filters.max_price},price_per_hour.lte.${filters.max_price},price_per_task.lte.${filters.max_price}`)
    }

    if (filters.min_accuracy) {
      query = query.gte('accuracy_score', filters.min_accuracy)
    }

    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to search models: ${error.message}`)
    }

    return (data || []).map(this.mapToModelListing)
  }

  /**
   * Map database record to ServiceListing
   */
  private mapToServiceListing(record: any): ServiceListing {
    return {
      id: record.id,
      org_id: record.org_id,
      seller_agent_id: record.seller_agent_id,
      service_name: record.service_name,
      service_type: record.service_type,
      service_description: record.service_description,
      service_category: record.service_category,
      price_per_unit: parseFloat(record.price_per_unit),
      unit_type: record.unit_type,
      min_units: record.min_units,
      max_units: record.max_units,
      available: record.available,
      total_capacity: record.total_capacity,
      used_capacity: record.used_capacity,
      avg_delivery_time_seconds: record.avg_delivery_time_seconds,
      success_rate: record.success_rate ? parseFloat(record.success_rate) : undefined,
      api_endpoint: record.api_endpoint,
      documentation_url: record.documentation_url,
      tags: record.tags || [],
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }

  /**
   * Map database record to ComputeListing
   */
  private mapToComputeListing(record: any): ComputeListing {
    return {
      id: record.id,
      org_id: record.org_id,
      node_id: record.node_id,
      compute_type: record.compute_type,
      compute_specs: record.compute_specs || {},
      price_per_hour: parseFloat(record.price_per_hour),
      price_per_minute: record.price_per_minute ? parseFloat(record.price_per_minute) : undefined,
      region: record.region,
      available: record.available,
      total_capacity: record.total_capacity ? parseFloat(record.total_capacity) : undefined,
      used_capacity: parseFloat(record.used_capacity),
      uptime_percentage: record.uptime_percentage ? parseFloat(record.uptime_percentage) : undefined,
      avg_latency_ms: record.avg_latency_ms,
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }

  /**
   * Map database record to ModelListing
   */
  private mapToModelListing(record: any): ModelListing {
    return {
      id: record.id,
      org_id: record.org_id,
      model_name: record.model_name,
      model_type: record.model_type,
      base_model: record.base_model,
      fine_tuned_for: record.fine_tuned_for,
      model_version: record.model_version,
      license_type: record.license_type,
      price_per_use: record.price_per_use ? parseFloat(record.price_per_use) : undefined,
      price_per_hour: record.price_per_hour ? parseFloat(record.price_per_hour) : undefined,
      price_per_task: record.price_per_task ? parseFloat(record.price_per_task) : undefined,
      royalty_percentage: record.royalty_percentage ? parseFloat(record.royalty_percentage) : undefined,
      model_size_mb: record.model_size_mb,
      parameters_count: record.parameters_count ? parseInt(record.parameters_count) : undefined,
      training_data_size: record.training_data_size ? parseInt(record.training_data_size) : undefined,
      accuracy_score: record.accuracy_score ? parseFloat(record.accuracy_score) : undefined,
      latency_ms: record.latency_ms,
      throughput_rps: record.throughput_rps,
      available: record.available,
      endpoint_url: record.endpoint_url,
      api_key_required: record.api_key_required,
      documentation_url: record.documentation_url,
      tags: record.tags || [],
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }

  /**
   * Map database record to MarketMaker
   */
  private mapToMarketMaker(record: any): MarketMaker {
    return {
      id: record.id,
      service_listing_id: record.service_listing_id,
      compute_listing_id: record.compute_listing_id,
      model_listing_id: record.model_listing_id,
      insight_listing_id: record.insight_listing_id,
      algorithm_type: record.algorithm_type,
      base_price: parseFloat(record.base_price),
      current_price: parseFloat(record.current_price),
      demand_factor: parseFloat(record.demand_factor),
      supply_factor: parseFloat(record.supply_factor),
      last_price_update: record.last_price_update ? new Date(record.last_price_update) : undefined,
      pricing_model: record.pricing_model || {},
      metadata: record.metadata || {},
      created_at: new Date(record.created_at),
      updated_at: new Date(record.updated_at),
    }
  }
}

