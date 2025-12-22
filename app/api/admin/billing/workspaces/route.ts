import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FOUNDER_EMAIL = "julian@smartsendhq.com";

export async function GET() {
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

  const { data, error } = await supabase
    .from("admin_workspace_health")
    .select("*")
    .order("workspace_id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ workspaces: data ?? [] });
}

