import type { EnrichmentAdapter } from "./adapters/types";
import { vendorA } from "./adapters/vendorA";
import { vendorB } from "./adapters/vendorB";

const REGISTRY: Record<string, EnrichmentAdapter> = {
  [vendorA.key]: vendorA,
  [vendorB.key]: vendorB,
};

export function getAdapter(key: string): EnrichmentAdapter | undefined {
  return REGISTRY[key];
}

