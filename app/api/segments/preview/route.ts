// app/api/segments/preview/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, requireUserAndAccount } from "@/lib/supabase/server";
import type { SegmentRuleNode } from "@/lib/segments/debug";
import { applySegmentFilters } from "@/lib/segments/query-builder";

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { account } = await requireUserAndAccount(supabase);

    const body = await req.json().catch(() => ({}));
    const { accountId, rules } = body as {
      accountId?: string;
      rules: SegmentRuleNode | null;
    };

    // Use accountId from body or fall back to authenticated account
    const targetAccountId = accountId || account.id;

    if (!targetAccountId) {
      return NextResponse.json(
        { error: "missing_account_id" },
        { status: 400 }
      );
    }

    // Build query with account filter
    // Include companies in select for company-level filtering
    let query = supabase
      .from("leads")
      .select("id, companies(id)", { count: "exact", head: true })
      .eq("account_id", targetAccountId) as any;

    // Apply segment rules if provided
    if (rules) {
      query = applySegmentFilters(query, rules);
    }

    const { count, error } = await query;

    if (error) {
      console.error("Segment preview query error:", error);
      return NextResponse.json(
        { error: "preview_query_failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      matchedCount: count ?? 0,
    });
  } catch (err: any) {
    console.error("Segment preview error:", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}

