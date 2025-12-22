// Block 140000 — SmartSend Roofing Website Widget
// API: Send notifications when widget lead is created
// POST /api/widget/notify

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { session_id, lead_id } = await req.json();

    if (!session_id || !lead_id) {
      return NextResponse.json(
        { error: "session_id and lead_id are required" },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get session and lead data
    const { data: session } = await supabase
      .from("webchat_sessions")
      .select(`
        *,
        roofing_companies!inner (
          id,
          owner_id,
          workspace_id,
          name
        )
      `)
      .eq("id", session_id)
      .single();

    if (!session) {
      return NextResponse.json({ ok: true }); // Don't fail if session not found
    }

    const company = (session as any).roofing_companies;
    const collectedData = session.collected_data || {};
    const name = collectedData.name || "Unknown";
    const address = collectedData.address || "";
    const problem = collectedData.problem || "";

    // Get lead details
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, address, notes")
      .eq("id", lead_id)
      .single();

    // Create notification for the company owner
    const notificationMessage = `💬 New Website Lead — ${name}${address ? `, ${address}` : ""}${problem ? `, ${problem.substring(0, 50)}${problem.length > 50 ? "..." : ""}` : ""}`;

    // Insert notification (if notifications table exists)
    try {
      await supabase.from("notifications").insert({
        user_id: company.owner_id,
        workspace_id: company.workspace_id,
        type: "system", // Using 'system' type since 'widget_lead' might not exist
        title: "New Website Lead",
        body: notificationMessage,
        data: {
          lead_id: lead_id,
          session_id: session_id,
          company_id: company.id,
          source: "website-widget",
        },
      });
    } catch (error) {
      // Notifications table might not exist, that's okay
      console.log("Notifications table not available:", error);
    }

    // Optional: Send email notification (if email system exists)
    // This would integrate with your existing email system

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in /api/widget/notify:", error);
    // Don't fail the request if notification fails
    return NextResponse.json({ ok: true });
  }
}


























