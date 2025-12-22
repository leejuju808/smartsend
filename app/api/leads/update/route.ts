// app/api/leads/update/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type LeadStatus = "new" | "in_progress" | "won" | "lost";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const body = (await req.json()) as {
      id?: string;
      status?: LeadStatus;
      notes?: string;
      estimatedValue?: number | null;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: "Missing lead id" },
        { status: 400 }
      );
    }

    const update: Record<string, any> = {};
    if (body.status) update.status = body.status;
    if (typeof body.notes === "string") update.notes = body.notes;
    if (typeof body.estimatedValue === "number" || body.estimatedValue === null) {
      update.estimated_value = body.estimatedValue;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", body.id);

    if (error) {
      console.error("Error updating lead:", error);
      return NextResponse.json(
        { error: "Failed to update lead", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/leads/update error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

