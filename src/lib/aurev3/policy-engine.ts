/**
 * AUREV Global Policy Engine
 * 
 * Ethics + compliance governance model
 * Enables safe autonomous decisions
 */

import { getServerSupabase } from '@/lib/supabase/server'

export interface Policy {
  id: string
  policyName: string
  policyVersion: number
  policyCategory: 'ethics' | 'compliance' | 'safety' | 'data_privacy' | 'autonomy'
  policyRules: Record<string, any>
  policyDescription?: string
  enforcementLevel: 'advisory' | 'required' | 'critical'
  autoApply: boolean
  status: 'draft' | 'active' | 'deprecated'
  effectiveAt?: Date
}

export interface PolicyViolation {
  id: string
  orgId: string
  agentId?: string
  policyId: string
  violationType: string
  violationSeverity: 'low' | 'medium' | 'high' | 'critical'
  violationDetails: Record<string, any>
  resolved: boolean
  resolvedAt?: Date
  resolutionAction?: string
  createdAt: Date
}

/**
 * Global Policy Engine
 */
export class PolicyEngine {
  private async getSupabase() {
    const { createServiceClient } = await import('@/lib/supabase/server')
    return createServiceClient()
  }
  
  /**
   * Evaluate decision against active policies
   */
  async evaluateDecision(
    orgId: string,
    agentId: string,
    decision: {
      type: string
      input: Record<string, any>
      output: Record<string, any>
    }
  ): Promise<{
    allowed: boolean
    violations: PolicyViolation[]
    warnings: string[]
  }> {
    // Get active policies
    const supabase = await this.getSupabase()
    const { data: policies } = await supabase
      .from('aurev_policies')
      .select('*')
      .eq('status', 'active')
      .order('enforcement_level', { ascending: false }) // Critical first
    
    if (!policies || policies.length === 0) {
      return { allowed: true, violations: [], warnings: [] }
    }
    
    const violations: PolicyViolation[] = []
    const warnings: string[] = []
    
    // Evaluate each policy
    for (const policy of policies) {
      const evaluation = this.evaluatePolicy(policy, decision)
      
      if (evaluation.violation) {
        // Record violation
        const violation = await this.recordViolation(
          orgId,
          agentId || undefined,
          policy.id,
          evaluation.violationType || 'unknown',
          evaluation.severity || 'medium',
          evaluation.details || {}
        )
        violations.push(violation)
        
        // Block if critical or required
        if (policy.enforcement_level === 'critical' || 
            (policy.enforcement_level === 'required' && !policy.auto_apply)) {
          return {
            allowed: false,
            violations,
            warnings,
          }
        }
      } else if (evaluation.warning) {
        warnings.push(evaluation.warning)
      }
    }
    
    return {
      allowed: violations.length === 0 || 
               violations.every(v => {
                 const policy = policies.find(p => p.id === v.policyId)
                 return policy?.enforcement_level === 'advisory' ||
                        policy?.auto_apply
               }),
      violations,
      warnings,
    }
  }
  
  /**
   * Evaluate a single policy
   */
  private evaluatePolicy(
    policy: Policy,
    decision: {
      type: string
      input: Record<string, any>
      output: Record<string, any>
    }
  ): {
    violation?: boolean
    violationType?: string
    severity?: PolicyViolation['violationSeverity']
    details?: Record<string, any>
    warning?: string
  } {
    const rules = policy.policyRules
    
    // Example policy evaluation logic
    // In production, this would use a proper rules engine
    
    // Check decision type
    if (rules.decisionTypes && !rules.decisionTypes.includes(decision.type)) {
      return {
        violation: true,
        violationType: 'unauthorized_decision_type',
        severity: 'high',
        details: {
          decisionType: decision.type,
          allowedTypes: rules.decisionTypes,
        },
      }
    }
    
    // Check output constraints
    if (rules.maxConfidence && decision.output.confidence > rules.maxConfidence) {
      return {
        warning: `Confidence ${decision.output.confidence} exceeds recommended maximum ${rules.maxConfidence}`,
      }
    }
    
    // Check data privacy rules
    if (policy.policyCategory === 'data_privacy') {
      if (decision.input.containsPII && !decision.output.anonymized) {
        return {
          violation: true,
          violationType: 'pii_not_anonymized',
          severity: 'critical',
          details: decision.input,
        }
      }
    }
    
    return {} // No violation
  }
  
  /**
   * Record policy violation
   */
  private async recordViolation(
    orgId: string,
    agentId: string | undefined,
    policyId: string,
    violationType: string,
    severity: PolicyViolation['violationSeverity'],
    details: Record<string, any>
  ): Promise<PolicyViolation> {
    const { data, error } = await const supabase = await this.getSupabase()
    const supabase
      .from('aurev_policy_violations')
      .insert({
        org_id: orgId,
        agent_id: agentId || null,
        policy_id: policyId,
        violation_type: violationType,
        violation_severity: severity,
        violation_details: details,
        resolved: false,
      })
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to record violation: ${error.message}`)
    }
    
    return {
      id: data.id,
      orgId: data.org_id,
      agentId: data.agent_id,
      policyId: data.policy_id,
      violationType: data.violation_type,
      violationSeverity: data.violation_severity,
      violationDetails: data.violation_details || {},
      resolved: data.resolved,
      resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
      resolutionAction: data.resolution_action,
      createdAt: new Date(data.created_at),
    }
  }
  
  /**
   * Get active policies
   */
  async getActivePolicies(
    category?: Policy['policyCategory']
  ): Promise<Policy[]> {
    let query = const supabase = await this.getSupabase()
    const supabase
      .from('aurev_policies')
      .select('*')
      .eq('status', 'active')
      .order('enforcement_level', { ascending: false })
    
    if (category) {
      query = query.eq('policy_category', category)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Failed to fetch policies: ${error.message}`)
    }
    
    return (data || []).map(this.mapToPolicy)
  }
  
  /**
   * Get violations for organization
   */
  async getOrgViolations(
    orgId: string,
    unresolvedOnly: boolean = true
  ): Promise<PolicyViolation[]> {
    let query = const supabase = await this.getSupabase()
    const supabase
      .from('aurev_policy_violations')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    
    if (unresolvedOnly) {
      query = query.eq('resolved', false)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Failed to fetch violations: ${error.message}`)
    }
    
    return (data || []).map(this.mapToViolation)
  }
  
  /**
   * Map database record to Policy
   */
  private mapToPolicy(record: any): Policy {
    return {
      id: record.id,
      policyName: record.policy_name,
      policyVersion: record.policy_version,
      policyCategory: record.policy_category,
      policyRules: record.policy_rules || {},
      policyDescription: record.policy_description,
      enforcementLevel: record.enforcement_level,
      autoApply: record.auto_apply || false,
      status: record.status,
      effectiveAt: record.effective_at ? new Date(record.effective_at) : undefined,
    }
  }
  
  /**
   * Map database record to PolicyViolation
   */
  private mapToViolation(record: any): PolicyViolation {
    return {
      id: record.id,
      orgId: record.org_id,
      agentId: record.agent_id,
      policyId: record.policy_id,
      violationType: record.violation_type,
      violationSeverity: record.violation_severity,
      violationDetails: record.violation_details || {},
      resolved: record.resolved,
      resolvedAt: record.resolved_at ? new Date(record.resolved_at) : undefined,
      resolutionAction: record.resolution_action,
      createdAt: new Date(record.created_at),
    }
  }
}

