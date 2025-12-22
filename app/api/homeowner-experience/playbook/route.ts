import { NextRequest, NextResponse } from "next/server";
import { generateAndSendPlaybook } from "@/lib/homeowner-experience/block25700-automation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, jobId, contactId, sendTiming, channel } = body;

    // Validate required fields
    if (!workspaceId || !contactId) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, contactId" },
        { status: 400 }
      );
    }

    // Generate and send playbook
    const result = await generateAndSendPlaybook({
      workspaceId,
      jobId,
      contactId,
      sendTiming,
      channel,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to generate and send playbook" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      playbookId: result.playbookId,
    });
  } catch (error: any) {
    console.error("Error generating playbook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve playbook
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playbookId = searchParams.get("playbookId");
    const jobId = searchParams.get("jobId");
    const contactId = searchParams.get("contactId");

    if (!playbookId && !jobId && !contactId) {
      return NextResponse.json(
        { error: "Missing required parameter: playbookId, jobId, or contactId" },
        { status: 400 }
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabase.from("homeowner_playbooks").select("*");

    if (playbookId) {
      query = query.eq("id", playbookId);
    } else if (jobId) {
      query = query.eq("job_id", jobId);
    } else if (contactId) {
      query = query.eq("contact_id", contactId);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(1);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Playbook not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      playbook: data[0],
    });
  } catch (error: any) {
    console.error("Error retrieving playbook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































