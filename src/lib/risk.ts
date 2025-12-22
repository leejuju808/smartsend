import { supabaseAdmin } from '@/server/supabase';

export interface DomainRisk {
  id: string;
  workspace_id: string;
  domain: string;
  risk_level: 'normal' | 'watch' | 'high';
  bounce_rate_7d: number;
  bounce_rate_30d: number;
  open_rate_7d: number;
  open_rate_30d: number;
  total_sent_7d: number;
  total_sent_30d: number;
  last_risk_update: string;
  risk_override?: string;
  created_at: string;
  updated_at: string;
}

export interface RiskAssessment {
  allowed: boolean;
  risk_level: string;
  delay_minutes: number;
  reason: string;
}

export interface RiskMetrics {
  total_domains: number;
  normal_domains: number;
  watch_domains: number;
  high_risk_domains: number;
  average_bounce_rate: number;
  average_open_rate: number;
}

/**
 * Risk Radar - Manages domain risk assessment and enforcement
 */
export class RiskRadar {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  /**
   * Check if a domain can send (risk-based enforcement)
   */
  async canDomainSend(domain: string): Promise<RiskAssessment> {
    try {
      const { data, error } = await supabaseAdmin
        .rpc('can_domain_send', { 
          workspace_id_param: this.workspaceId, 
          domain_param: domain 
        });

      if (error) {
        console.error('Error checking domain risk:', error);
        return {
          allowed: true, // Default to allowed on error
          risk_level: 'normal',
          delay_minutes: 0,
          reason: 'Error checking risk, defaulting to allowed'
        };
      }

      if (!data || data.length === 0) {
        return {
          allowed: true,
          risk_level: 'normal',
          delay_minutes: 0,
          reason: 'No risk data available'
        };
      }

      const result = data[0];
      return {
        allowed: result.allowed,
        risk_level: result.risk_level,
        delay_minutes: result.delay_minutes,
        reason: result.reason
      };
    } catch (error) {
      console.error('Error checking domain risk:', error);
      return {
        allowed: true,
        risk_level: 'normal',
        delay_minutes: 0,
        reason: 'Error checking risk, defaulting to allowed'
      };
    }
  }

  /**
   * Get current risk level for a domain
   */
  async getDomainRisk(domain: string): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .rpc('get_domain_risk', { 
          workspace_id_param: this.workspaceId, 
          domain_param: domain 
        });

      if (error) {
        console.error('Error getting domain risk:', error);
        return 'normal';
      }

      return data || 'normal';
    } catch (error) {
      console.error('Error getting domain risk:', error);
      return 'normal';
    }
  }

  /**
   * Manually recompute risk for a domain
   */
  async recomputeDomainRisk(domain: string): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .rpc('compute_domain_risk', { 
          workspace_id_param: this.workspaceId, 
          domain_param: domain 
        });

      if (error) {
        console.error('Error recomputing domain risk:', error);
        return 'normal';
      }

      return data || 'normal';
    } catch (error) {
      console.error('Error recomputing domain risk:', error);
      return 'normal';
    }
  }

  /**
   * Override risk level for a domain (manual intervention)
   */
  async overrideDomainRisk(
    domain: string, 
    riskLevel: 'normal' | 'watch' | 'high', 
    reason: string
  ): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('domain_risk')
        .upsert({
          workspace_id: this.workspaceId,
          domain,
          risk_level: riskLevel,
          risk_override: reason,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error overriding domain risk:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error overriding domain risk:', error);
      return false;
    }
  }

  /**
   * Get all domain risks for the workspace
   */
  async getAllDomainRisks(): Promise<DomainRisk[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('domain_risk')
        .select('*')
        .eq('workspace_id', this.workspaceId)
        .order('risk_level', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching domain risks:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching domain risks:', error);
      return [];
    }
  }

  /**
   * Get domains by risk level
   */
  async getDomainsByRiskLevel(riskLevel: 'normal' | 'watch' | 'high'): Promise<DomainRisk[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('domain_risk')
        .select('*')
        .eq('workspace_id', this.workspaceId)
        .eq('risk_level', riskLevel)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching domains by risk level:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching domains by risk level:', error);
      return [];
    }
  }

  /**
   * Get risk metrics summary for the workspace
   */
  async getRiskMetrics(): Promise<RiskMetrics> {
    try {
      const domains = await this.getAllDomainRisks();
      
      const normalDomains = domains.filter(d => d.risk_level === 'normal').length;
      const watchDomains = domains.filter(d => d.risk_level === 'watch').length;
      const highRiskDomains = domains.filter(d => d.risk_level === 'high').length;

      // Calculate averages
      const totalBounceRate = domains.reduce((sum, d) => sum + d.bounce_rate_7d, 0);
      const totalOpenRate = domains.reduce((sum, d) => sum + d.open_rate_7d, 0);
      const activeDomains = domains.filter(d => d.total_sent_7d > 0).length;

      return {
        total_domains: domains.length,
        normal_domains: normalDomains,
        watch_domains: watchDomains,
        high_risk_domains: highRiskDomains,
        average_bounce_rate: activeDomains > 0 ? totalBounceRate / activeDomains : 0,
        average_open_rate: activeDomains > 0 ? totalOpenRate / activeDomains : 0
      };
    } catch (error) {
      console.error('Error calculating risk metrics:', error);
      return {
        total_domains: 0,
        normal_domains: 0,
        watch_domains: 0,
        high_risk_domains: 0,
        average_bounce_rate: 0,
        average_open_rate: 0
      };
    }
  }

  /**
   * Get domains that need attention (watch or high risk)
   */
  async getAttentionDomains(): Promise<DomainRisk[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('domain_risk')
        .select('*')
        .eq('workspace_id', this.workspaceId)
        .in('risk_level', ['watch', 'high'])
        .order('risk_level', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching attention domains:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching attention domains:', error);
      return [];
    }
  }

  /**
   * Bulk recompute risk for all domains
   */
  async recomputeAllDomainRisks(): Promise<{
    total: number;
    updated: number;
    errors: number;
  }> {
    try {
      const domains = await this.getAllDomainRisks();
      let updated = 0;
      let errors = 0;

      for (const domain of domains) {
        try {
          await this.recomputeDomainRisk(domain.domain);
          updated++;
        } catch (error) {
          console.error(`Error recomputing risk for ${domain.domain}:`, error);
          errors++;
        }
      }

      return {
        total: domains.length,
        updated,
        errors
      };
    } catch (error) {
      console.error('Error in bulk risk recomputation:', error);
      return {
        total: 0,
        updated: 0,
        errors: 1
      };
    }
  }

  /**
   * Get risk trends over time (for charts)
   */
  async getRiskTrends(days: number = 30): Promise<{
    date: string;
    normal: number;
    watch: number;
    high: number;
  }[]> {
    try {
      // This would require additional tracking of risk level changes over time
      // For now, return current snapshot
      const metrics = await this.getRiskMetrics();
      
      return [{
        date: new Date().toISOString().split('T')[0],
        normal: metrics.normal_domains,
        watch: metrics.watch_domains,
        high: metrics.high_risk_domains
      }];
    } catch (error) {
      console.error('Error getting risk trends:', error);
      return [];
    }
  }

  /**
   * Export risk data for analysis
   */
  async exportRiskData(): Promise<{
    domains: DomainRisk[];
    metrics: RiskMetrics;
    export_date: string;
  }> {
    try {
      const domains = await this.getAllDomainRisks();
      const metrics = await this.getRiskMetrics();

      return {
        domains,
        metrics,
        export_date: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error exporting risk data:', error);
      throw error;
    }
  }
} 