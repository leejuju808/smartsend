import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin"]);
  if (!gate.allowed) {
    return gate.res;
  }

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

  const { name, prompt, account_id } = body;

  if (!name || !prompt) {
    return NextResponse.json(
      { error: "name and prompt are required" },
      { status: 400 }
    );
  }

  // Get account_id from user role if not provided
  const roleData = gate.roleData;
  const finalAccountId = account_id || roleData?.account_id;

  if (!finalAccountId) {
    return NextResponse.json(
      { error: "account_id is required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("shared_resources")
      .insert({
        smart: true,
        kind: "saved_view",
        name,
        llm_prompt: prompt,
        filters: {}, // Not used in SmartList
        sort: { field: "created_at", dir: "desc" },
        scope: "team",
        owner_id: userData.user.id,
        account_id: finalAccountId,
        entity: "leads",
        llm_rules: {},
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating SmartList:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err: any) {
    console.error("Error in smartlists/create:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}












