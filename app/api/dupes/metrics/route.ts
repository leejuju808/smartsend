import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET() {
  const supabase = createClient();
  await setAccountContext(supabase);

  const { data: dupe, error: dupeError } = await supabase
    .from("dupe_metrics")
    .select("*")
    .gte("day", new Date(Date.now() - 7 * 86400000).toISOString());

  if (dupeError) {
    return NextResponse.json({ error: dupeError.message }, { status: 400 });
  }

  const { data: merges, error: mergeError } = await supabase
    .from("merge_metrics")
    .select("*")
    .gte("day", new Date(Date.now() - 7 * 86400000).toISOString());

  if (mergeError) {
    return NextResponse.json({ error: mergeError.message }, { status: 400 });
  }

  return NextResponse.json({ dupe, merges });
}


