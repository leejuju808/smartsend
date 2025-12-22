import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveAccountContext } from "../_helpers";

const TierSchema = z.object({
  name_thresh: z.number().min(0).max(1),
  company_thresh: z.number().min(0).max(1),
  require_same_domain: z.boolean(),
});

const UpdateSchema = z.object({
  autoMergeEnabled: z.boolean(),
  rules: z.object({
    auto: TierSchema,
    review: TierSchema,
    ignore: TierSchema,
  }),
});

type TierKey = "auto" | "review" | "ignore";

type TierConfig = {
  name_thresh: number;
  company_thresh: number;
  require_same_domain: boolean;
};

const DEFAULT_RULES: Record<TierKey, TierConfig> = {
  auto: { name_thresh: 0.94, company_thresh: 0.92, require_same_domain: true },
  review: { name_thresh: 0.9, company_thresh: 0.88, require_same_domain: true },
  ignore: { name_thresh: 0.8, company_thresh: 0.75, require_same_domain: false },
};

export async function GET() {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const admin = createServiceClient();

  const { data: rulesData, error: rulesError } = await admin
    .from("merge_rules")
    .select("tier, name_thresh, company_thresh, require_same_domain")
    .eq("account_id", context.accountId);

  if (rulesError) {
    return NextResponse.json({ error: rulesError.message }, { status: 400 });
  }

  const rules: Record<TierKey, TierConfig> = {
    auto: { ...DEFAULT_RULES.auto },
    review: { ...DEFAULT_RULES.review },
    ignore: { ...DEFAULT_RULES.ignore },
  };

  (rulesData ?? []).forEach((row) => {
    const tier = row.tier as TierKey;
    if (tier in rules) {
      rules[tier] = {
        name_thresh: row.name_thresh,
        company_thresh: row.company_thresh,
        require_same_domain: row.require_same_domain,
      };
    }
  });

  const { data: settingsRow, error: settingsError } = await admin
    .from("account_settings")
    .select("auto_merge_dupes")
    .eq("account_id", context.accountId)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 });
  }

  const autoMergeEnabled = settingsRow?.auto_merge_dupes ?? false;

  const { data: countData, error: countError } = await supabase.rpc("count_auto_merge_ready", {});
  const autoReadyCount = countError ? 0 : countData ?? 0;

  return NextResponse.json({
    autoMergeEnabled,
    rules,
    autoReadyCount,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const role = (context.role ?? "").toLowerCase();
  if (!["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors.map((e) => e.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createServiceClient();

  const upserts = (Object.keys(body.rules) as TierKey[]).map((tier) => ({
    account_id: context.accountId,
    tier,
    name_thresh: body.rules[tier].name_thresh,
    company_thresh: body.rules[tier].company_thresh,
    require_same_domain: body.rules[tier].require_same_domain,
  }));

  const { error: upsertError } = await admin
    .from("merge_rules")
    .upsert(upserts, { onConflict: "account_id,tier" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  const { error: settingsError } = await admin
    .from("account_settings")
    .upsert({
      account_id: context.accountId,
      auto_merge_dupes: body.autoMergeEnabled,
    }, { onConflict: "account_id" });

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 });
  }

  const { data: countData, error: countError } = await supabase.rpc("count_auto_merge_ready", {});
  const autoReadyCount = countError ? 0 : countData ?? 0;

  return NextResponse.json({
    autoMergeEnabled: body.autoMergeEnabled,
    rules: body.rules,
    autoReadyCount,
  });
}

