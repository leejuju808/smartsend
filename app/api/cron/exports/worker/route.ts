import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCSV, formatDateForCSV, formatTagsForCSV, truncateSnippet, LeadExportRow } from "@/lib/exports/csvGenerator";

/**
 * Background worker for processing lead exports
 * Runs every minute to process pending exports
 * 
 * GET /api/cron/exports/worker
 */
export async function GET() {
  try {
    // Fetch pending exports (limit to 5 at a time to avoid overload)
    const { data: pendingExports, error: fetchError } = await supabaseAdmin
      .from("exports")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(5);

    if (fetchError) {
      console.error("Error fetching pending exports:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pendingExports || pendingExports.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let processed = 0;

    for (const exportRecord of pendingExports) {
      try {
        // Mark as processing
        await supabaseAdmin
          .from("exports")
          .update({ status: "processing" })
          .eq("id", exportRecord.id);

        // Process the export
        await processExport(exportRecord);
        processed++;
      } catch (error: any) {
        console.error(`Error processing export ${exportRecord.id}:`, error);
        
        // Mark as failed
        await supabaseAdmin
          .from("exports")
          .update({
            status: "failed",
            error_message: error.message || "Unknown error",
          })
          .eq("id", exportRecord.id);
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (error: any) {
    console.error("Export worker error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Process a single export
 */
async function processExport(exportRecord: any) {
  const { workspace_id, user_id, filters } = exportRecord;

  // Build query to get contacts based on filters
  let query = supabaseAdmin
    .from("contacts")
    .select(`
      id,
      email,
      first_name,
      last_name,
      city,
      state,
      postal_code,
      tags,
      lead_status,
      created_at,
      updated_at,
      source
    `)
    .eq("workspace_id", workspace_id);

  // Apply filters
  const scope = filters?.scope || "all";
  
  if (scope === "hot") {
    query = query.eq("lead_status", "hot");
  } else if (scope === "warm") {
    query = query.eq("lead_status", "warm");
  } else if (scope === "custom" && filters?.status) {
    query = query.eq("lead_status", filters.status);
  }

  // Date range filter
  if (filters?.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("created_at", filters.dateTo);
  }

  const { data: contacts, error: contactsError } = await query.order("created_at", { ascending: false });

  if (contactsError) {
    throw new Error(`Failed to fetch contacts: ${contactsError.message}`);
  }

  if (!contacts || contacts.length === 0) {
    // No contacts to export - mark as complete with empty file
    await supabaseAdmin
      .from("exports")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        row_count: 0,
      })
      .eq("id", exportRecord.id);
    return;
  }

  const contactIds = contacts.map((c) => c.id);
  const contactEmails = contacts.map((c) => c.email?.toLowerCase()).filter(Boolean);

  // Get reply threads for last reply info
  // Try contact_id first, then fallback to matching via lead_id -> contacts.email
  const { data: replyThreads } = await supabaseAdmin
    .from("reply_threads")
    .select(`
      id,
      contact_id,
      lead_id,
      last_message_at,
      last_activity_at,
      assigned_to
    `)
    .eq("workspace_id", workspace_id)
    .or(`contact_id.in.(${contactIds.join(",")}),lead_id.not.is.null`);

  // Get reply messages for last reply snippet
  const threadIds = (replyThreads || []).map((rt) => rt.id).filter(Boolean);
  const { data: replyMessages } = threadIds.length > 0
    ? await supabaseAdmin
        .from("reply_messages")
        .select("thread_id, snippet, body, sent_at, direction")
        .in("thread_id", threadIds)
        .eq("direction", "inbound")
        .order("sent_at", { ascending: false })
    : { data: null, error: null };

  // Get campaign associations for campaign origin
  const { data: campaignContacts } = await supabaseAdmin
    .from("campaign_contacts")
    .select("contact_id, campaign_id")
    .in("contact_id", contactIds);

  const campaignIds = [
    ...new Set((campaignContacts || []).map((cc: any) => cc.campaign_id).filter(Boolean)),
  ];

  const { data: campaigns } = campaignIds.length > 0
    ? await supabaseAdmin
        .from("campaigns")
        .select("id, name")
        .in("id", campaignIds)
    : { data: null, error: null };

  const campaignMap = new Map<string, string>();
  (campaigns || []).forEach((c: any) => {
    campaignMap.set(c.id, c.name);
  });

  // Get assigned team member names
  const assignedUserIds = [
    ...new Set((replyThreads || []).map((rt) => rt.assigned_to).filter(Boolean)),
  ];

  const { data: assignedUsers } = assignedUserIds.length > 0
    ? await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", assignedUserIds)
    : { data: null, error: null };

  const userMap = new Map<string, string>();
  (assignedUsers || []).forEach((u: any) => {
    userMap.set(u.id, u.full_name || u.email || "");
  });

  // Map lead_id to contact_id via email matching (for threads that use lead_id)
  const leadToContactMap = new Map<string, string>();
  if (replyThreads && replyThreads.length > 0) {
    const leadIds = [...new Set((replyThreads || []).map((rt: any) => rt.lead_id).filter(Boolean))];
    if (leadIds.length > 0) {
      const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("id, email")
        .in("id", leadIds);
      
      (leads || []).forEach((lead: any) => {
        const contact = contacts.find((c) => c.email?.toLowerCase() === lead.email?.toLowerCase());
        if (contact) {
          leadToContactMap.set(lead.id, contact.id);
        }
      });
    }
  }

  // Get first contacted date (earliest campaign_contacts.created_at or contact.created_at)
  const { data: firstContacts } = await supabaseAdmin
    .from("campaign_contacts")
    .select("contact_id, created_at")
    .in("contact_id", contactIds)
    .order("created_at", { ascending: true });

  const firstContactMap = new Map<string, string>();
  (firstContacts || []).forEach((fc: any) => {
    if (!firstContactMap.has(fc.contact_id)) {
      firstContactMap.set(fc.contact_id, fc.created_at);
    }
  });

  // Get last message sent date (from outbound messages)
  const { data: outboundMessages } = await supabaseAdmin
    .from("reply_messages")
    .select("thread_id, sent_at, direction")
    .in("thread_id", threadIds)
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false });

  const threadToContactMap = new Map<string, string>();
  (replyThreads || []).forEach((rt: any) => {
    const contactId = rt.contact_id || leadToContactMap.get(rt.lead_id);
    if (contactId) {
      threadToContactMap.set(rt.id, contactId);
    }
  });

  const lastMessageMap = new Map<string, string>();
  (outboundMessages || []).forEach((msg: any) => {
    const contactId = threadToContactMap.get(msg.thread_id);
    if (contactId && (!lastMessageMap.has(contactId) || lastMessageMap.get(contactId)! < msg.sent_at)) {
      lastMessageMap.set(contactId, msg.sent_at);
    }
  });

  // Build reply snippet map (latest inbound message per contact)
  const replySnippetMap = new Map<string, string>();
  (replyMessages || []).forEach((msg: any) => {
    const contactId = threadToContactMap.get(msg.thread_id);
    if (contactId && !replySnippetMap.has(contactId)) {
      const snippet = msg.snippet || truncateSnippet(msg.body);
      replySnippetMap.set(contactId, snippet);
    }
  });

  const lastReplyDateMap = new Map<string, string>();
  (replyMessages || []).forEach((msg: any) => {
    const contactId = threadToContactMap.get(msg.thread_id);
    if (contactId && (!lastReplyDateMap.has(contactId) || lastReplyDateMap.get(contactId)! < msg.sent_at)) {
      lastReplyDateMap.set(contactId, msg.sent_at);
    }
  });

  // Build contact to campaign map
  const contactCampaignMap = new Map<string, string[]>();
  (campaignContacts || []).forEach((cc: any) => {
    const campaignName = campaignMap.get(cc.campaign_id);
    if (campaignName) {
      if (!contactCampaignMap.has(cc.contact_id)) {
        contactCampaignMap.set(cc.contact_id, []);
      }
      const campaigns = contactCampaignMap.get(cc.contact_id)!;
      if (!campaigns.includes(campaignName)) {
        campaigns.push(campaignName);
      }
    }
  });

  // Build contact to assigned user map
  const contactAssignedMap = new Map<string, string>();
  (replyThreads || []).forEach((rt: any) => {
    if (rt.assigned_to) {
      const userName = userMap.get(rt.assigned_to);
      if (userName) {
        const contactId = rt.contact_id || leadToContactMap.get(rt.lead_id);
        if (contactId) {
          contactAssignedMap.set(contactId, userName);
        }
      }
    }
  });

  // Build CSV rows
  const csvRows: LeadExportRow[] = contacts.map((contact: any) => {
    const campaigns = contactCampaignMap.get(contact.id) || [];
    const assignedUser = contactAssignedMap.get(contact.id) || "";
    const firstContacted = firstContactMap.get(contact.id) || contact.created_at || "";
    const lastMessageSent = lastMessageMap.get(contact.id) || "";
    const lastReplyDate = lastReplyDateMap.get(contact.id) || "";
    const lastReplySnippet = replySnippetMap.get(contact.id) || "";

    return {
      homeowner_email: contact.email || "",
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      city: contact.city || "",
      state: contact.state || "",
      zip: contact.postal_code || "",
      tags: formatTagsForCSV(contact.tags),
      lead_status: contact.lead_status || "new",
      date_first_contacted: formatDateForCSV(firstContacted),
      date_last_message_sent: formatDateForCSV(lastMessageSent),
      date_of_last_reply: formatDateForCSV(lastReplyDate),
      last_reply_snippet: truncateSnippet(lastReplySnippet),
      assigned_team_member: assignedUser,
      campaign_origin: campaigns.join(", "),
      created_at: formatDateForCSV(contact.created_at),
      updated_at: formatDateForCSV(contact.updated_at),
    };
  });

  // Generate CSV
  const csv = generateCSV(csvRows);

  // Upload to Supabase storage
  const fileName = `exports/${exportRecord.id}.csv`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("exports")
    .upload(fileName, csv, {
      contentType: "text/csv",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload CSV: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from("exports")
    .getPublicUrl(fileName);

  // Mark as complete
  await supabaseAdmin
    .from("exports")
    .update({
      status: "complete",
      file_path: fileName,
      file_url: urlData?.publicUrl || "",
      completed_at: new Date().toISOString(),
      row_count: csvRows.length,
    })
    .eq("id", exportRecord.id);

  // TODO: Send email notification to user
  // await sendExportReadyEmail(user_id, exportRecord.id, urlData?.publicUrl);
}

