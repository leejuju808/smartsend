import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

/** Replace with real auth */
async function getUserId(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("userId"); // TEMP
}

const ALLOWED = new Set(["draft", "running", "paused", "completed", "demo"]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json().catch(() => ({}));
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Only allow changing sequences owned by user
  const { error } = await supabaseAdmin
    .from("sequences")
    .update({ status })
    .eq("id", params.id)
    .eq("owner", userId);

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

