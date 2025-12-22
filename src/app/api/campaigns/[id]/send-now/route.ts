import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { processQueueNow } from "@/lib/sender/processQueueNow";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { lead_id, step_no = 1 } = await req.json() || {};
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  // Get campaign context for account/user
  const { data: camp, error: cerr } = await sb
    .from("campaigns")
    .select("id, user_id, account_id, mailbox_id")
    .eq("id", params.id)
    .single();
  if (cerr || !camp) return NextResponse.json({ error: cerr?.message || "Campaign not found" }, { status: 404 });

  // Get account/mailbox ID - handle both schema variants
  const accountOrMailboxId = camp.account_id || (camp as any).mailbox_id;
  if (!accountOrMailboxId) {
    // Try to get a default account for the user
    const { data: defaultAccount } = await sb
      .from("connected_accounts")
      .select("id")
      .eq("user_id", camp.user_id)
      .limit(1)
      .maybeSingle();
    if (!defaultAccount) {
      return NextResponse.json({ error: "No account/mailbox configured" }, { status: 400 });
    }
    accountOrMailboxId = defaultAccount.id;
  }

  // Insert queue row due now for this step (adhoc=true allows multiple sends)
  const queueData: any = {
    user_id: camp.user_id,
    campaign_id: camp.id,
    lead_id,
    scheduled_at: new Date().toISOString(),
    status: "queued",
    step_no,
    adhoc: true,
  };
  
  // Set account_id or mailbox_id depending on schema
  if (camp.account_id) {
    queueData.account_id = accountOrMailboxId;
  } else {
    queueData.mailbox_id = accountOrMailboxId;
  }

  const { data: q, error: qerr } = await sb
    .from("send_queue")
    .insert(queueData)
    .select("id")
    .single();
  if (qerr || !q) return NextResponse.json({ error: qerr?.message || "Queue failed" }, { status: 400 });

  // Process immediately (server-side)
  try {
    const result = await processQueueNow({ queueId: q.id });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Send failed" }, { status: 500 });
  }
}
