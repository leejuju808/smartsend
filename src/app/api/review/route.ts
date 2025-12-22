import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";

export async function GET(req: NextRequest) {
  try {
    const supabase = serverClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    const { data, error } = await supabase
      .from("ai_review_queue")
      .select("*")
      .eq("org_id", org.id)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ drafts: data || [] });
  } catch (error: any) {
    console.error("Error fetching review queue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = serverClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await req.json();
    const { id, action } = body; // action: "approve" | "reject"

    if (!id || !action) {
      return NextResponse.json(
        { error: "id and action are required" },
        { status: 400 }
      );
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // Get the draft first
    const { data: draft, error: fetchError } = await supabase
      .from("ai_review_queue")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .single();

    if (fetchError || !draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      );
    }

    if (draft.status !== "pending") {
      return NextResponse.json(
        { error: "Draft already reviewed" },
        { status: 400 }
      );
    }

    // Update the review status
    const newStatus = action === "approve" ? "approved" : "rejected";
    const { error: updateError } = await supabase
      .from("ai_review_queue")
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // If approved, trigger the send (call SmartSend's send endpoint)
    if (action === "approve" && draft.draft) {
      try {
        // TODO: Integrate with actual send endpoint
        // For now, we'll just log it
        console.log("Draft approved, would send:", {
          org_id: org.id,
          lead_id: draft.lead_id,
          channel: draft.channel,
          message: draft.draft,
        });

        // In production, you would call your send endpoint here:
        // await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/whatsapp/send`, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({
        //     org_id: org.id,
        //     lead_id: draft.lead_id,
        //     message: draft.draft,
        //   }),
        // });
      } catch (sendError) {
        console.error("Error sending approved draft:", sendError);
        // Don't fail the approval, just log it
      }
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (error: any) {
    console.error("Error updating review:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

