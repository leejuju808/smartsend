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

  // Check limit if activating sequence (status = 'active' or 'running')
  if (status === 'active' || status === 'running') {
    // Get sequence workspace_id first
    const { data: seq } = await supabaseAdmin
      .from("sequences")
      .select("workspace_id")
      .eq("id", params.id)
      .single();

    if (seq?.workspace_id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
      const limitRes = await fetch(`${appUrl}/api/limits/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: seq.workspace_id,
          kind: "sequences",
          delta: 1,
        }),
      });

      const limitJson = await limitRes.json();
      if (limitJson.status === "blocked") {
        return NextResponse.json(
          {
            error: "sequences_limit",
            message: "You can only have up to 5 active sequences in this workspace.",
          },
          { status: 403 }
        );
      }
    }
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

