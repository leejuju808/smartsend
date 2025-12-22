// POST /api/inbox/threads/[id]/suggest-reply
// Get AI-suggested reply for a thread

import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const threadId = params.id;

  try {
    const suggestUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/inbox-suggest-reply`;
    const response = await fetch(suggestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        thread_id: threadId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Edge function error:", error);
      return NextResponse.json(
        { error: "Failed to generate suggested reply" },
        { status: 500 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in suggest reply API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































