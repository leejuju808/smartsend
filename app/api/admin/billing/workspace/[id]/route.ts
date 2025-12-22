import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FOUNDER_EMAIL = "julian@smartsendhq.com";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is founder/admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  if (profile?.email !== FOUNDER_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = params.id;

  const [ws, events, txs] = await Promise.all([
    supabase
      .from("admin_workspace_health")
      .select("*")
      .eq("workspace_id", id)
      .single(),
    supabase
      .from("billing_events")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("credit_transactions")
      .select("*")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    workspace: ws.data,
    events: events.data ?? [],
    creditTransactions: txs.data ?? [],
  });
}

