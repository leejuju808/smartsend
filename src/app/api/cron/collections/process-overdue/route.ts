import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/cron/collections/process-overdue
 * CRON endpoint to process overdue invoices and queue collection emails
 * Runs daily to check for overdue invoices and send appropriate collection reminders
 * 
 * Block 26280 — SmartSend Roofing Collections Email Playbooks v1
 */
export async function POST(req: NextRequest) {
  try {
    // Verify CRON secret if provided (check both header and query param)
    const authHeader = req.headers.get("authorization");
    const { searchParams } = new URL(req.url);
    const keyParam = searchParams.get("key");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret) {
      const headerValid = authHeader === `Bearer ${cronSecret}`;
      const queryValid = keyParam === cronSecret;
      if (!headerValid && !queryValid) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find all overdue invoices with outstanding balances
    const { data: overdueInvoices, error: invoicesError } = await supabase
      .from("roofing_invoice_balances")
      .select(`
        invoice_id,
        workspace_id,
        payer_type,
        payer_name,
        payer_email,
        payer_phone,
        invoice_number,
        invoice_amount,
        amount_paid,
        balance_due,
        due_date,
        status,
        claim_number,
        check_stage
      `)
      .in("status", ["sent", "partial", "overdue"])
      .gt("balance_due", 0)
      .not("payer_email", "is", null);

    if (invoicesError) {
      console.error("Error fetching overdue invoices:", invoicesError);
      return NextResponse.json(
        { error: invoicesError.message },
        { status: 500 }
      );
    }

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No overdue invoices found",
        processed: 0,
        queued: 0,
      });
    }

    let processed = 0;
    let queued = 0;
    let errors = 0;

    // Process each overdue invoice
    for (const invoice of overdueInvoices) {
      try {
        // Calculate days overdue
        const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
        const daysOverdue = dueDate 
          ? Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        // Check if we've already sent a reminder recently (within last 3 days for same level)
        // This prevents spamming
        const { data: recentReminders } = await supabase
          .from("roofing_collection_reminders")
          .select("level, sent_at")
          .eq("invoice_id", invoice.invoice_id)
          .eq("status", "sent")
          .gte("sent_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
          .order("sent_at", { ascending: false })
          .limit(1);

        // If we sent a reminder in the last 3 days, skip
        if (recentReminders && recentReminders.length > 0) {
          continue;
        }

        // Determine what level reminder we should send
        let targetLevel: "soft" | "professional" | "firm" | "final";
        if (daysOverdue <= 0) {
          targetLevel = "soft";
        } else if (daysOverdue <= 7) {
          targetLevel = "professional";
        } else if (daysOverdue <= 15) {
          targetLevel = "firm";
        } else {
          targetLevel = "final";
        }

        // Check if we've already sent this level or higher
        const { data: allReminders } = await supabase
          .from("roofing_collection_reminders")
          .select("level")
          .eq("invoice_id", invoice.invoice_id)
          .eq("status", "sent");

        if (allReminders && allReminders.length > 0) {
          const sentLevels = allReminders.map(r => r.level);
          const levelHierarchy = { soft: 1, professional: 2, firm: 3, final: 4 };
          const maxSentLevel = Math.max(...sentLevels.map(l => levelHierarchy[l as keyof typeof levelHierarchy]));
          const targetLevelNum = levelHierarchy[targetLevel];

          // Don't downgrade - if we've sent a higher level, keep sending that level
          if (maxSentLevel > targetLevelNum) {
            targetLevel = Object.keys(levelHierarchy).find(
              k => levelHierarchy[k as keyof typeof levelHierarchy] === maxSentLevel
            ) as typeof targetLevel;
          }
        }

        // Get the playbook for this payer type and level
        const { data: playbook } = await supabase
          .from("roofing_collections_playbooks")
          .select("*")
          .eq("payer_type", invoice.payer_type)
          .eq("level", targetLevel)
          .single();

        if (!playbook) {
          console.error(`No playbook found for payer_type=${invoice.payer_type}, level=${targetLevel}`);
          errors++;
          continue;
        }

        // Render templates
        const subject = renderTemplate(playbook.subject_template, invoice);
        const body = renderTemplate(playbook.body_template, invoice);

        // Get or create collections campaign for this workspace
        let campaignId = await getOrCreateCollectionsCampaign(supabase, invoice.workspace_id);
        if (!campaignId) {
          console.error(`Failed to get/create campaign for workspace ${invoice.workspace_id}`);
          errors++;
          continue;
        }

        // Get or create contact for payer
        let contactId = await getOrCreateContact(supabase, invoice.workspace_id, {
          email: invoice.payer_email,
          first_name: invoice.payer_name?.split(" ")[0] || null,
          last_name: invoice.payer_name?.split(" ").slice(1).join(" ") || null,
          phone: invoice.payer_phone || null,
        });

        if (!contactId) {
          console.error(`Failed to get/create contact for ${invoice.payer_email}`);
          errors++;
          continue;
        }

        // Get or create lead for send_queue (send_queue requires lead_id)
        let leadId = await getOrCreateLead(supabase, invoice.workspace_id, {
          email: invoice.payer_email,
          first_name: invoice.payer_name?.split(" ")[0] || null,
          last_name: invoice.payer_name?.split(" ").slice(1).join(" ") || null,
        });

        if (!leadId) {
          console.error(`Failed to get/create lead for ${invoice.payer_email}`);
          errors++;
          continue;
        }

        // Get workspace default inbox
        const { data: inbox } = await supabase
          .from("inboxes")
          .select("id")
          .eq("workspace_id", invoice.workspace_id)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (!inbox) {
          console.error(`No active inbox found for workspace ${invoice.workspace_id}`);
          errors++;
          continue;
        }

        // Calculate scheduled send time
        // Soft reminders: next business day 9 AM
        // Others: immediate
        let scheduledAt = new Date();
        if (targetLevel === "soft") {
          scheduledAt = new Date();
          scheduledAt.setDate(scheduledAt.getDate() + 1);
          scheduledAt.setHours(9, 0, 0, 0);
          // If it's already past 9 AM today, schedule for tomorrow
          const now = new Date();
          if (now.getHours() < 9) {
            scheduledAt = new Date();
            scheduledAt.setHours(9, 0, 0, 0);
          }
        }

        // Insert into send_queue
        const { data: queueItem, error: queueError } = await supabase
          .from("send_queue")
          .insert({
            campaign_id: campaignId,
            lead_id: leadId,
            from_inbox_id: inbox.id,
            subject: subject,
            body_html: body,
            body_text: stripHtml(body),
            scheduled_at: scheduledAt.toISOString(),
            status: "pending",
            priority: targetLevel === "final" ? 50 : 100, // Higher priority for final notices
          })
          .select("id")
          .single();

        if (queueError || !queueItem) {
          console.error(`Failed to queue email:`, queueError);
          errors++;
          continue;
        }

        // Create reminder record
        await supabase
          .from("roofing_collection_reminders")
          .insert({
            invoice_id: invoice.invoice_id,
            playbook_id: playbook.id,
            level: targetLevel,
            scheduled_send_at: scheduledAt.toISOString(),
            status: "scheduled",
            send_queue_id: queueItem.id,
          });

        queued++;
        processed++;
      } catch (error) {
        console.error(`Error processing invoice ${invoice.invoice_id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} invoices, queued ${queued} collection emails`,
      processed,
      queued,
      errors,
    });
  } catch (error) {
    console.error("Error in collections process-overdue:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Get or create a "Collections Campaign" for a workspace
 */
async function getOrCreateCollectionsCampaign(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string
): Promise<string | null> {
  // Try to find existing collections campaign
  const { data: existingCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Collections Campaign")
    .eq("status", "active")
    .limit(1)
    .single();

  if (existingCampaign) {
    return existingCampaign.id;
  }

  // Create new collections campaign
  // First, get workspace owner/user_id
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id, user_id")
    .eq("id", workspaceId)
    .single();

  const userId = workspace?.owner_id || workspace?.user_id;
  if (!userId) {
    return null;
  }

  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      name: "Collections Campaign",
      status: "active",
      campaign_type: "other",
      is_paused: false,
    })
    .select("id")
    .single();

  if (error || !newCampaign) {
    console.error("Failed to create collections campaign:", error);
    return null;
  }

  return newCampaign.id;
}

/**
 * Get or create a contact for a payer
 */
async function getOrCreateContact(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  contactData: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  }
): Promise<string | null> {
  // Try to find existing contact
  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("email", contactData.email.toLowerCase())
    .limit(1)
    .single();

  if (existingContact) {
    return existingContact.id;
  }

  // Create new contact
  const { data: newContact, error } = await supabase
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      email: contactData.email.toLowerCase(),
      first_name: contactData.first_name,
      last_name: contactData.last_name,
      phone: contactData.phone,
      source: "collections_automation",
    })
    .select("id")
    .single();

  if (error || !newContact) {
    console.error("Failed to create contact:", error);
    return null;
  }

  return newContact.id;
}

/**
 * Get or create a lead for send_queue (send_queue requires lead_id)
 */
async function getOrCreateLead(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  leadData: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  }
): Promise<string | null> {
  // Try to find existing lead by email and workspace
  // Note: leads table structure may vary, so we try multiple approaches
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("email", leadData.email.toLowerCase())
    .eq("workspace_id", workspaceId)
    .limit(1)
    .maybeSingle();

  if (existingLead) {
    return existingLead.id;
  }

  // Try without workspace_id (some schemas don't have it)
  const { data: existingLead2 } = await supabase
    .from("leads")
    .select("id")
    .eq("email", leadData.email.toLowerCase())
    .limit(1)
    .maybeSingle();

  if (existingLead2) {
    return existingLead2.id;
  }

  // Create new lead
  // Try with workspace_id first
  const insertData: any = {
    email: leadData.email.toLowerCase(),
    first_name: leadData.first_name,
    last_name: leadData.last_name,
    workspace_id: workspaceId,
  };

  const { data: newLead, error } = await supabase
    .from("leads")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    // If workspace_id doesn't exist, try without it
    delete insertData.workspace_id;
    const { data: newLead2, error: error2 } = await supabase
      .from("leads")
      .insert(insertData)
      .select("id")
      .single();

    if (error2 || !newLead2) {
      console.error("Failed to create lead:", error2 || error);
      return null;
    }

    return newLead2.id;
  }

  if (!newLead) {
    return null;
  }

  return newLead.id;
}

/**
 * Render template with invoice variables
 */
function renderTemplate(template: string, invoice: any): string {
  let rendered = template;

  // Replace variables
  rendered = rendered.replace(/\{\{name\}\}/g, invoice.payer_name || "Valued Customer");
  rendered = rendered.replace(/\{\{balance\}\}/g, formatCurrency(invoice.balance_due));
  rendered = rendered.replace(/\{\{invoice_number\}\}/g, invoice.invoice_number || "N/A");
  rendered = rendered.replace(/\{\{invoice_amount\}\}/g, formatCurrency(invoice.invoice_amount));
  rendered = rendered.replace(/\{\{amount_paid\}\}/g, formatCurrency(invoice.amount_paid || 0));
  rendered = rendered.replace(/\{\{due_date\}\}/g, invoice.due_date ? formatDate(invoice.due_date) : "N/A");
  rendered = rendered.replace(/\{\{claim_number\}\}/g, invoice.claim_number || "N/A");

  return rendered;
}

/**
 * Format currency
 */
function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date
 */
function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}



































