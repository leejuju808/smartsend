import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/inbox/playbook/[threadId] - Get install-ready playbook for a thread
 * POST /api/inbox/playbook/[threadId] - Generate install-ready playbook for a thread
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient();

    // Get playbook data from thread
    const { data: thread, error } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        install_ready_playbook_generated,
        install_ready_playbook_generated_at,
        install_ready_call_script,
        install_ready_followup_sequence,
        install_ready_next_action,
        install_ready_next_action_priority,
        install_ready_playbook_metadata,
        insurance_carrier,
        insurance_claim_status,
        insurance_deductible_amount,
        insurance_payout_type,
        insurance_install_ready,
        roof_scope,
        claim_financials
      `)
      .eq("id", params.threadId)
      .single();

    if (error || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      playbook_generated: thread.install_ready_playbook_generated,
      generated_at: thread.install_ready_playbook_generated_at,
      call_script: thread.install_ready_call_script,
      followup_sequence: thread.install_ready_followup_sequence,
      next_action: thread.install_ready_next_action,
      next_action_priority: thread.install_ready_next_action_priority,
      metadata: thread.install_ready_playbook_metadata,
      insurance_context: {
        carrier: thread.insurance_carrier,
        claim_status: thread.insurance_claim_status,
        deductible: thread.insurance_deductible_amount,
        payout_type: thread.insurance_payout_type,
        install_ready: thread.insurance_install_ready,
      },
      scope_context: {
        roof_scope: thread.roof_scope,
        claim_financials: thread.claim_financials,
      },
    });
  } catch (error: any) {
    console.error("Error fetching playbook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient();

    // Verify thread exists and user has access
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, insurance_install_ready, insurance_claim_status, has_parsed_scope")
      .eq("id", params.threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Check if playbook should be generated
    const shouldGenerate =
      thread.insurance_install_ready === true ||
      (thread.insurance_claim_status === "approved" && thread.has_parsed_scope === true);

    if (!shouldGenerate) {
      return NextResponse.json(
        { error: "Thread is not install-ready. Playbook can only be generated for install-ready leads." },
        { status: 400 }
      );
    }

    // Call the edge function to generate playbook
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const edgeUrl = `${supabaseUrl}/functions/v1/install-ready-playbook-v1`;

    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ thread_id: params.threadId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Failed to generate playbook", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("Error generating playbook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

