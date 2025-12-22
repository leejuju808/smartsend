export type LeadInput = {
  id: string;
  account_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
};

export type EnrichOk = {
  status: "ok";
  data: {
    company_name?: string | null;
    company_domain?: string | null;
    company_employee_count?: number | null;
    company_industry?: string | null;
    company_category?: string | null;
    role_title?: string | null;
    role_seniority?: string | null;
    tech_stack?: string[] | null;
  };
};

export type EnrichMiss = { status: "not_found" };
export type EnrichRate = { status: "rate_limited"; retryAfterSec?: number };
export type EnrichErr = { status: "error"; message?: string };

export type EnrichResult = EnrichOk | EnrichMiss | EnrichRate | EnrichErr;

export type VendorSecrets = Record<string, string>;

export interface EnrichmentAdapter {
  key: string;
  enrich(lead: LeadInput, secrets: VendorSecrets): Promise<EnrichResult>;
  map?(raw: any): EnrichOk["data"];
}

