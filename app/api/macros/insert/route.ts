import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const threadId = body?.thread_id as string | undefined;
  const macroId = body?.macro_id as string | undefined;

  if (!threadId || !macroId) {
    return NextResponse.json({ error: "thread_id and macro_id required" }, { status: 400 });
  }

  const authClient = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const { data: hasAccess, error: aclError } = await authClient.rpc("is_campaign_member", {
    p_campaign: thread.campaign_id,
    p_user: user.id,
  });

  if (aclError) {
    return NextResponse.json({ error: aclError.message }, { status: 500 });
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const { data: macro, error: macroError } = await supabase
    .from("reply_macros")
    .select("id,body,campaign_id")
    .eq("id", macroId)
    .eq("is_active", true)
    .maybeSingle();

  if (macroError) {
    return NextResponse.json({ error: macroError.message }, { status: 500 });
  }

  if (!macro) {
    return NextResponse.json({ error: "macro not found" }, { status: 404 });
  }

  if (macro.campaign_id !== thread.campaign_id) {
    return NextResponse.json({ error: "macro does not belong to campaign" }, { status: 400 });
  }

  const { data: hydrated, error: hydrateError } = await supabase.rpc("macro_hydrate", {
    p_thread: threadId,
    p_text: macro.body,
  });

  if (hydrateError) {
    return NextResponse.json({ error: hydrateError.message }, { status: 500 });
  }

  await supabase
    .from("reply_macro_uses")
    .insert({
      macro_id: macroId,
      thread_id: threadId,
      user_id: user.id,
      hydrated_vars: null,
    })
    .throwOnError();

  return NextResponse.json({ ok: true, body: hydrated ?? macro.body });
}








