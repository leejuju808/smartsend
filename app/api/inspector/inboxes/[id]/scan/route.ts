import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const inboxId = params.id;

    // Verify inbox access
    const { data: inbox, error: inboxError } = await supabase
      .from("sender_inboxes")
      .select("id, workspace_id, email, sender_domains!inner(domain)")
      .eq("id", inboxId)
      .single();

    if (inboxError || !inbox) {
      return NextResponse.json(
        { error: "Inbox not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: ws, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", inbox.workspace_id)
      .single();

    if (wsError || !ws) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Call DNS scanner edge function
    const dnsScanResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/dns-scanner`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          inbox_id: inboxId,
          domain: inbox.sender_domains.domain,
        }),
      }
    );

    if (!dnsScanResponse.ok) {
      const error = await dnsScanResponse.json();
      return NextResponse.json(
        { error: error.error || "DNS scan failed" },
        { status: dnsScanResponse.status }
      );
    }

    const dnsScanResult = await dnsScanResponse.json();

    // Call inbox inspector edge function
    const inspectorResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/inbox-inspector`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          inbox_id: inboxId,
        }),
      }
    );

    if (!inspectorResponse.ok) {
      const error = await inspectorResponse.json();
      return NextResponse.json(
        { error: error.error || "Inbox inspection failed" },
        { status: inspectorResponse.status }
      );
    }

    const inspectorResult = await inspectorResponse.json();

    // Log activity
    await supabase.from("workspace_activity").insert({
      workspace_id: inbox.workspace_id,
      actor_id: user.id,
      event_type: "inbox_inspector_scan",
      description: `DNS scan completed for ${inbox.email}`,
      metadata: {
        inbox_id: inboxId,
        health_score: inspectorResult.report?.health_score,
        health_status: inspectorResult.report?.health_status,
      },
    });

    return NextResponse.json({
      dns_scan: dnsScanResult,
      inspection: inspectorResult,
    });
  } catch (error: any) {
    console.error("Error in POST /api/inspector/inboxes/[id]/scan:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



