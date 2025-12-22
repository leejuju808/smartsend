import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { updateLeadScore } from "@/lib/lead-scoring";

// 1x1 transparent PNG
const PNG_1X1 =
  Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,10,73,68,65,84,120,156,99,0,1,0,0,5,0,1,13,10,42,188,0,0,0,0,73,69,78,68,174,66,96,130]);

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  // Lookup job by token
  const { data: job, error } = await supabase
    .from("email_jobs")
    .select("id, workspace_id, lead_id, first_opened_at")
    .eq("tracking_pixel_token", params.token)
    .maybeSingle();

  // Always return a pixel, even if not found (avoid leaking)
  if (!job || error) {
    return new NextResponse(PNG_1X1, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  }

  // Capture request context
  const ua = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || (req as any).ip || null;

  // Log open
  await supabase.from("email_open_events").insert({
    job_id: job.id, workspace_id: job.workspace_id, user_agent: ua, ip
  });

  // Mirror into generic events (unified analytics)
  await supabase.from("email_events").insert({
    job_id: job.id, event_type: "opened", payload: { source: "pixel" }
  });

  // Stamp first_opened_at once
  if (!job.first_opened_at) {
    await supabase.from("email_jobs")
      .update({ first_opened_at: new Date().toISOString() })
      .eq("id", job.id);
  }

  // Update lead score (fire and forget)
  if (job.lead_id) {
    updateLeadScore(job.lead_id, "email_open", job.workspace_id);
  }

  // Return the pixel
  return new NextResponse(PNG_1X1, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}