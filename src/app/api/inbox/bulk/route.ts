import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type Body =
  | { action: "close"; thread_ids: string[] }
  | { action: "reopen"; thread_ids: string[] }
  | { action: "assign"; thread_ids: string[]; user_id: string | null }
  | { action: "clear_label"; thread_ids: string[] }
  | { action: "apply_label"; thread_ids: string[]; label: string };

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = (await req.json()) as Body;

  const ids = (body as any).thread_ids || [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "thread_ids required" }, { status: 400 });
  }

  let result;
  switch (body.action) {
    case "close":
      result = await supabase.rpc("bulk_close_threads", { p_threads: ids });
      break;
    case "reopen":
      result = await supabase.rpc("bulk_reopen_threads", { p_threads: ids });
      break;
    case "assign":
      result = await supabase.rpc("bulk_assign_threads", { 
        p_threads: ids, 
        p_user: (body as any).user_id ?? null 
      });
      break;
    case "clear_label":
      result = await supabase.rpc("bulk_clear_thread_labels", { p_threads: ids });
      break;
    case "apply_label":
      result = await supabase.rpc("bulk_apply_thread_label", { 
        p_threads: ids, 
        p_label: (body as any).label 
      });
      break;
    default:
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  if ((result as any).error) {
    return NextResponse.json({ error: (result as any).error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, affected: (result as any).data ?? 0 });
}

