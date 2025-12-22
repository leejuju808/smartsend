import { NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/org";

const SUPABASE_EDGE_URL =
  process.env.SUPABASE_EDGE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") + "/functions/v1";

export async function POST(req: Request) {
  try {
    const { lead_id, sequence_id } = await req.json();

    if (!lead_id || !sequence_id) {
      return NextResponse.json(
        { error: "lead_id and sequence_id required" },
        { status: 400 }
      );
    }

    const org_id = getActiveOrgId();
    if (!org_id) {
      return NextResponse.json(
        { error: "No active organization" },
        { status: 400 }
      );
    }

    // Forward to edge function
    const r = await fetch(`${SUPABASE_EDGE_URL}/seq-enroll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ org_id, lead_id, sequence_id }),
    });

    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
