import type {
  EnrichmentAdapter,
  EnrichResult,
  LeadInput,
  VendorSecrets,
} from "./types";

export const vendorB: EnrichmentAdapter = {
  key: "vendor_b",
  async enrich(
    lead: LeadInput,
    secrets: VendorSecrets,
  ): Promise<EnrichResult> {
    void secrets;

    const domain = lead.email?.split("@")[1] ?? null;

    return {
      status: "ok",
      data: {
        company_name: lead.company ?? null,
        company_domain: domain,
        company_employee_count: 120,
        company_industry: "Software",
        company_category: "SaaS",
        role_title: "Operations Manager",
        role_seniority: "Manager",
        tech_stack: ["HubSpot", "Postgres"],
      },
    };
  },
};

