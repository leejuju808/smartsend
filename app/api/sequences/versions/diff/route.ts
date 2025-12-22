import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { v1, v2 } = await req.json();

  if (!v1 || !v2) {
    return NextResponse.json(
      { error: "Both v1 and v2 version IDs are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("diff_sequence_versions", {
    v1,
    v2,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ diff: data }, { status: 200 });
}








