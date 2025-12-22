import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/permissions";
import { logAction } from "@/lib/log";

export async function POST(req: Request) {
  try {
    const { workspace_id, user_email, senderEmail, campaignId, to, subject, text, html } = await req.json();
    
    // Check permissions
    await checkPermission(user_email, workspace_id, "send");

    // Call the existing send API
    const sendResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderEmail, campaignId, to, subject, text, html }),
    });

    const sendResult = await sendResponse.json();

    if (sendResult.success) {
      // Log the successful send action
      await logAction(workspace_id, user_email, "send_email", { 
        to, 
        subject, 
        campaignId,
        transportMessageId: sendResult.transportMessageId 
      });
      
      return NextResponse.json({ success: true, ...sendResult });
    } else {
      // Log failed attempt
      await logAction(workspace_id, user_email, "send_email_failed", { 
        to, 
        subject, 
        campaignId,
        error: sendResult.error 
      });
      
      return NextResponse.json(sendResult, { status: sendResponse.status });
    }
  } catch (e: any) {
    // Log permission denied or other errors
    if (e.message === "Permission denied" || e.message === "User not in workspace") {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    
    console.error(e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}