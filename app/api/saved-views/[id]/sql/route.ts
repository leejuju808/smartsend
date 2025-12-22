import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  await setAccountContext(supabase);

  const { data, error } = await supabase.rpc("render_saved_view_sql", {
    p_view_id: params.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ sql: data });
}


