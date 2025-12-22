import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { applySegmentFilters } from "@/lib/segments/query-builder";
import type { SegmentRuleNode } from "@/lib/segments/debug";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { smartlistId } = body;

  if (!smartlistId) {
    return NextResponse.json(
      { error: "smartlistId is required" },
      { status: 400 }
    );
  }

  try {
    // Load SmartList
    const { data: list, error: listError } = await supabase
      .from("shared_resources")
      .select("*")
      .eq("id", smartlistId)
      .eq("smart", true)
      .single();

    if (listError || !list) {
      return NextResponse.json(
        { error: "SmartList not found" },
        { status: 404 }
      );
    }

    // Get account_id for filtering leads
    const { data: roleData } = await supabase
      .from("team_members")
      .select("account_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!roleData?.account_id) {
      return NextResponse.json(
        { error: "account not found" },
        { status: 404 }
      );
    }

    const rules = (list.llm_rules as SegmentRuleNode | null) ?? null;

    // Build base query for leads
    let leadsQuery = supabase
      .from("leads")
      .select("*, companies(*)")
      .eq("account_id", roleData.account_id);

    // Apply SmartList rules
    if (rules) {
      leadsQuery = applySegmentFilters(leadsQuery, rules);
    }

    // Execute query
    const { data: leads, error: leadsError } = await leadsQuery.limit(1000);

    if (leadsError) {
      console.error("Error evaluating SmartList:", leadsError);
      return NextResponse.json(
        { error: leadsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      leads: leads ?? [],
      count: leads?.length ?? 0,
    });
  } catch (err: any) {
    console.error("Error in smartlists/evaluate:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}












