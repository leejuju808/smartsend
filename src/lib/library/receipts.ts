import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { LibraryKind } from "./constants";

export type LibraryReceipt = {
  kind: LibraryKind;
  added: number;
  updated: number;
};

type ComputeReceiptOptions = {
  kind: LibraryKind;
  campaignId: string;
  content: unknown;
  supabase: SupabaseClient<any, "public", any>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normaliseScenario(value: unknown): string {
  if (isNonEmptyString(value)) {
    return value.trim();
  }

  return "neutral";
}

function coerceVariantArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
}

export class ReceiptComputationError extends Error {
  constructor(message: string, public readonly cause?: PostgrestError | Error) {
    super(message);
    this.name = "ReceiptComputationError";
  }
}

export async function computeLibraryReceipt({
  kind,
  campaignId,
  content,
  supabase,
}: ComputeReceiptOptions): Promise<LibraryReceipt> {
  if (kind !== "nudge_preset") {
    return { kind, added: 0, updated: 0 };
  }

  const payload = (content ?? {}) as Record<string, unknown>;
  const scenario = normaliseScenario(payload.scenario);
  const variants = coerceVariantArray(payload.variants);

  if (variants.length === 0) {
    return { kind, added: 0, updated: 0 };
  }

  const variantKeys = variants
    .map((variant) => {
      const raw = variant.source_key;
      if (isNonEmptyString(raw)) {
        return raw.trim();
      }
      return null;
    })
    .filter((key): key is string => key !== null);

  let updated = 0;

  if (variantKeys.length > 0) {
    const uniqueKeys = [...new Set(variantKeys)];

    try {
      const { data, error } = await supabase
        .from("nudge_variants")
        .select("source_key")
        .eq("campaign_id", campaignId)
        .eq("scenario", scenario)
        .in("source_key", uniqueKeys);

      if (error) {
        throw new ReceiptComputationError("failed to fetch existing nudge variants", error);
      }

      const existingKeys = new Set(
        (data ?? [])
          .map((row) => row?.source_key)
          .filter((key): key is string => isNonEmptyString(key)),
      );

      updated = variants.reduce((count, variant) => {
        const raw = variant.source_key;
        if (isNonEmptyString(raw) && existingKeys.has(raw.trim())) {
          return count + 1;
        }
        return count;
      }, 0);
    } catch (error) {
      if (error instanceof ReceiptComputationError) {
        throw error;
      }
      throw new ReceiptComputationError("unexpected error determining receipt", error as Error);
    }
  }

  const added = Math.max(variants.length - updated, 0);

  return { kind, added, updated };
}






