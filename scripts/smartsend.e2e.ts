/* scripts/smartsend.e2e.ts */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Load env from .env.local.test if ENV_FILE is set
const envFile = process.env.ENV_FILE || ".env.local";
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, "utf8");
  for (const line of envContent.split("\n")) {
    const [key, ...valueParts] = line.split("=");
    if (key && !key.startsWith("#")) {
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      if (value && !process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const REPLY_FN_URL = process.env.REPLY_FN_URL || `${SUPABASE_URL}/functions/v1/replyDetection`;
const REPLY_WEBHOOK_URL = process.env.REPLY_WEBHOOK_URL || `${SUPABASE_URL}/functions/v1/reply-webhook`;
const RETRY_FN_URL = process.env.RETRY_FN_URL || `${SUPABASE_URL}/functions/v1/retryQueue`;

const supabase = createClient(SUPABASE_URL, SRK);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("=== SmartSend E2E ===");

  // Get or create a test user
  let testUserId: string | null = null;
  const testEmail = "e2e-test@smartsend.ai";
  
  try {
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(testEmail);
    if (existingUser?.user) {
      testUserId = existingUser.user.id;
      console.log("Using existing test user:", testUserId);
    }
  } catch (e: any) {
    // User doesn't exist, create one
    const { data: newUser, error: userErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: "e2e-test-password-123",
      email_confirm: true,
    });
    if (userErr) throw userErr;
    if (!newUser?.user?.id) throw new Error("Failed to create test user");
    testUserId = newUser.user.id;
    console.log("Created test user:", testUserId);
  }

  // 1) Create a campaign
  const campaignData: any = {
    name: `E2E ${new Date().toISOString()}`,
    send_window_start: "08:00",
    send_window_end: "17:00",
    timezone: "America/Los_Angeles",
  };

  // Add user_id if campaigns table requires it
  const { data: campaignsCheck } = await supabase
    .from("campaigns")
    .select("user_id")
    .limit(1)
    .maybeSingle()
    .catch(() => ({ data: null }));
  
  if (campaignsCheck && testUserId) {
    campaignData.user_id = testUserId;
  }

  // Add workspace_id if campaigns table requires it
  const { data: workspaceCheck } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .limit(1)
    .maybeSingle()
    .catch(() => ({ data: null }));

  if (workspaceCheck && workspaceCheck.workspace_id) {
    // Try to get or create a workspace for the test user
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("user_id", testUserId)
      .limit(1)
      .maybeSingle()
      .catch(() => ({ data: null }));
    
    if (workspace) {
      campaignData.workspace_id = workspace.id;
    } else {
      // Create a minimal workspace
      const { data: newWorkspace, error: wsErr } = await supabase
        .from("workspaces")
        .insert({ name: "E2E Test Workspace", user_id: testUserId })
        .select("id")
        .single()
        .catch(() => ({ data: null, error: null }));
      if (wsErr) console.warn("Workspace creation failed, continuing:", wsErr);
      if (newWorkspace) campaignData.workspace_id = newWorkspace.id;
    }
  }

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .insert(campaignData)
    .select("*")
    .single();
  if (campErr) throw campErr;
  console.log("Campaign:", campaign.id);

  // 2) Import CSV → leads (simulate your import path by parsing CSV here)
  const csvPath = path.join(process.cwd(), "tests/fixtures/leads.sample.csv");
  const csv = fs.readFileSync(csvPath, "utf8").trim().split("\n").slice(1);
  const rows = csv.map(line => {
    const [email, first_name, last_name, company] = line.split(",");
    return {
      email: email.trim(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      company: company.trim(),
      status: "queued",
      campaign_id: campaign.id,
      thread_id: crypto.randomUUID(),
    };
  });

  // Add user_id if leads table requires it
  const { data: leadsCheck } = await supabase
    .from("leads")
    .select("user_id")
    .limit(1)
    .maybeSingle()
    .catch(() => ({ data: null }));

  if (leadsCheck && testUserId) {
    rows.forEach(r => (r as any).user_id = testUserId);
  }

  const { error: leadErr } = await supabase.from("leads").insert(rows);
  if (leadErr) throw leadErr;
  console.log("Leads inserted:", rows.length);

  // 3) Seed send_queue rows for each lead (simulate scheduler output)
  // fetch lead ids
  const { data: leads, error: getLeadsErr } = await supabase
    .from("leads")
    .select("id,email,thread_id,company,first_name,last_name")
    .eq("campaign_id", campaign.id);
  if (getLeadsErr) throw getLeadsErr;

  const queueRows = leads.map(lead => {
    const queueItem: any = {
      campaign_id: campaign.id,
      lead_id: lead.id,
      status: "queued",
      scheduled_at: new Date().toISOString(),
    };

    // Add common fields that might be required
    if (campaign.workspace_id) queueItem.workspace_id = campaign.workspace_id;
    if (testUserId) queueItem.user_id = testUserId;
    
    // Add attempt field if it exists
    queueItem.attempt = 0;
    
    // Add email-related fields that might be required
    queueItem.to_email = lead.email;
    queueItem.email = lead.email;
    queueItem.subject = "Quick question";
    queueItem.body = `Hi ${lead.first_name || "there"},<br><br>Quick question about ${lead.company || "your company"}.`;
    queueItem.body_html = queueItem.body;

    return queueItem;
  });

  const { error: queueErr } = await supabase.from("send_queue").insert(queueRows);
  if (queueErr) throw queueErr;
  console.log("Queue seeded:", queueRows.length);

  // 4) Simulate send worker: mark one sent, one failed, one sent
  const a = leads[0], b = leads[1], c = leads[2];

  // helper to update both send_queue + leads
  async function setOutcome(leadId: string, status: "sent" | "failed") {
    const { error: upQ } = await supabase
      .from("send_queue")
      .update({ status })
      .eq("lead_id", leadId);
    if (upQ) throw upQ;
    
    const { error: upL } = await supabase
      .from("leads")
      .update({ status })
      .eq("id", leadId);
    if (upL) throw upL;
  }

  await setOutcome(a.id, "sent");
  await setOutcome(b.id, "failed");
  await setOutcome(c.id, "sent");
  console.log("Outcomes: A sent, B failed, C sent");

  // 5) Retry the failed one via Edge Function
  {
    const { data: qIdsResp, error: qErr } = await supabase
      .from("send_queue")
      .select("id")
      .eq("lead_id", b.id);
    if (qErr) throw qErr;
    
    const qId = qIdsResp?.[0]?.id;
    if (!qId) throw new Error("No queue ID found for failed lead");

    const res = await fetch(RETRY_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SRK}`,
      },
      body: JSON.stringify({
        queue_ids: [qId],
        max_attempts: 3,
        reason: "E2E retry",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error("Retry failed: " + JSON.stringify(data));
    console.log("Retry response:", data);
    
    // Wait a bit for retry to process
    await sleep(500);
  }

  // 6) Simulate a human reply for lead A via replyDetection → replyWebhook
  {
    const body = "Thanks for reaching out — let's talk next week.";
    const rd = await fetch(REPLY_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SRK}`,
        "x-webhook-secret": process.env.REPLY_WEBHOOK_SECRET || "",
        "x-admin-token": process.env.ADMIN_TOKEN || "",
      },
      body: JSON.stringify({
        thread_id: a.thread_id,
        subject: "Re: Quick question",
        body,
        from_email: "alex@testco.com",
      }),
    });

    const r1 = await rd.json();
    console.log("replyDetection:", r1);

    // Webhook to cancel future sends for A
    const wh = await fetch(REPLY_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SRK}`,
      },
      body: JSON.stringify({
        thread_id: a.thread_id,
        subject: "Re: Quick question",
        from_email: "alex@testco.com",
        workspace_id: campaign.workspace_id || testUserId,
        provider: "gmail",
        text: body,
      }),
    });

    const r2 = await wh.json();
    if (!wh.ok) throw new Error("Webhook failed: " + JSON.stringify(r2));
    console.log("replyWebhook:", r2);

    // Wait a bit for reply processing
    await sleep(500);
  }

  // 7) Assertions — expect: replied=1 (A), failed=0 (was retried to queued), sent=1 (C), queued>=1 (B after retry)
  const { data: ok, error: assertErr } = await supabase.rpc("assert_counts", {
    _campaign_id: campaign.id,
    _queued: 1,    // B should be queued after retry
    _sending: 0,
    _sent: 1,      // C sent
    _failed: 0,    // B no longer failed
    _replied: 1,   // A replied
  });

  if (assertErr) {
    console.error("Assertion error:", assertErr);
    throw assertErr;
  }

  console.log("Assertions pass:", ok === true);
  if (ok !== true) {
    throw new Error("Assertions failed!");
  }

  console.log("✅ E2E complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

