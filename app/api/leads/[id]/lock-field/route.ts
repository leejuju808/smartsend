import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function setAccountContext(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.account_id) {
    await supabase.rpc("set_account", { p_account_id: membership.account_id });
  }

  return { error: null };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { error } = await setAccountContext(supabase);
  if (error) {
    return error;
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const field = typeof (payload as any)?.field === "string" ? ((payload as any).field as string) : null;
  const locked = typeof (payload as any)?.locked === "boolean" ? ((payload as any).locked as boolean) : Boolean((payload as any)?.locked);

  if (!field) {
    return NextResponse.json({ error: "Field is required" }, { status: 400 });
  }

  const { data: leadRow, error: fetchError } = await supabase
    .from("leads")
    .select("user_locked")
    .eq("id", params.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }

  const currentLocks = (leadRow?.user_locked as Record<string, unknown>) ?? {};
  const nextLocked = { ...currentLocks, [field]: locked };

  const { error: updateError } = await supabase
    .from("leads")
    .update({ user_locked: nextLocked })
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user_locked: nextLocked });
}



