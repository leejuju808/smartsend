import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function GET() {
  const ws = await getActiveWorkspaceId();
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("provider_accounts")
    .select("id, provider, email_address, settings")
    .eq("workspace_id", ws);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data ?? []);
}
