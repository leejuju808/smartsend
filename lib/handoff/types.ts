// Handoff types and interfaces

export interface HandoffPayload {
  lead_name: string;
  lead_email: string;
  company?: string;
  summary?: string;
  tone?: string;
  opportunity?: number;
  objections?: any[];
  buyer_role?: string;
  campaign_id?: string;
  lead_id?: string;
  company_id?: string;
}

export interface HandoffResult {
  status: 'success' | 'failed' | 'ignored';
  message?: string;
  data?: any;
}












