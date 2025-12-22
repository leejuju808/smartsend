import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

// POST /api/inbox/unified/[id]/classify - Trigger AI classification for a message
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const messageId = params.id;

  try {
    // Trigger classification via edge function
    const classifyUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/unified-classify-intent`;
    const response = await fetch(classifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Classification failed", details: error },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error triggering classification:", error);
    return NextResponse.json(
      { error: "Failed to trigger classification" },
      { status: 500 }
    );
  }
}


































