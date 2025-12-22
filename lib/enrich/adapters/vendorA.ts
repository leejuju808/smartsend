import type {
  EnrichmentAdapter,
  EnrichResult,
  LeadInput,
  VendorSecrets,
} from "./types";

export const vendorA: EnrichmentAdapter = {
  key: "vendor_a",
  async enrich(
    lead: LeadInput,
    secrets: VendorSecrets,
  ): Promise<EnrichResult> {
    void secrets;

    if (Math.random() < 0.1) {
      return { status: "rate_limited" };
    }

    return { status: "not_found" };
  },
};

