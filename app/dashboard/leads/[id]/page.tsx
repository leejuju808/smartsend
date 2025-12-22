// app/dashboard/leads/[id]/page.tsx

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import LeadDetailClient from "../_components/LeadDetailClient";
import { LeadTimeline } from "./LeadTimeline";
import { LeadOutcomeControls } from "@/app/(dashboard)/leads/LeadOutcomeControls";
import { CallHistory } from "@/components/leads/call-history";

export const metadata: Metadata = {
  title: "Lead · SmartSend",
};

type LeadRow = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  email: string | null;
  name: string | null;
  status: string;
  source: string | null;
  estimated_value: number | null;
  currency: string | null;
  created_at: string;
  outcome: "won" | "lost" | null;
  won_value: number | null;
  lost_reason: string | null;
  is_hot?: boolean | null;
  hot_reason?: string | null;
  hot_score?: number | null;
  smartsend_homeowner?: boolean | null;
};

type ContactRow = {
  id: string;
  workspace_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  created_at: string;
  smartsend_homeowner?: boolean | null;
};

type OutboundRow = {
  id: string;
  campaign_id: string;
  campaign_contact_id: string;
  contact_id: string;
  step_id: string;
  to_email: string;
  subject: string;
  body: string;
  send_at: string;
  sent_at: string | null;
  status: string;
};

type ReplyRow = {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
  intent: string | null;
};

type TaskRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  contact_id: string;
  reply_id: string;
  task_type: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
};

type CallNotes = {
  address: string | null;
  issueType: string | null;
  urgency: string | null;
  generatedAt: string | null;
} | null;

interface LeadPageProps {
  params: { id: string };
}

async function loadLead(id: string): Promise<LeadRow | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
      id,
      workspace_id,
      contact_id,
      email,
      name,
      status,
      source,
      estimated_value,
      currency,
      created_at,
      outcome,
      won_value,
      lost_reason,
      is_hot,
      hot_reason,
      hot_score,
      smartsend_homeowner
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error loading lead:", error);
    return null;
  }

  return (data as LeadRow) ?? null;
}

async function loadContact(
  lead: LeadRow
): Promise<ContactRow | null> {
  const supabase = createClient();

  // Prefer explicit contact_id; fallback via email lookup
  if (lead.contact_id) {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        `
        id,
        workspace_id,
        email,
        first_name,
        last_name,
        city,
        state,
        phone,
        created_at,
        smartsend_homeowner
      `
      )
      .eq("id", lead.contact_id)
      .maybeSingle();

    if (error) {
      console.error("Error loading contact by id:", error);
      return null;
    }

    return (data as ContactRow) ?? null;
  }

  if (!lead.email) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `
      id,
      workspace_id,
      email,
      first_name,
      last_name,
      city,
      state,
      phone,
      created_at,
      smartsend_homeowner
    `
    )
    .eq("workspace_id", lead.workspace_id)
    .ilike("email", lead.email)
    .maybeSingle();

  if (error) {
    console.error("Error loading contact by email:", error);
    return null;
  }

  return (data as ContactRow) ?? null;
}

async function loadOutbound(
  lead: LeadRow,
  contact: ContactRow | null
): Promise<OutboundRow[]> {
  if (!contact) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from("outbound_emails")
    .select(
      `
      id,
      campaign_id,
      campaign_contact_id,
      contact_id,
      step_id,
      to_email,
      subject,
      body,
      send_at,
      sent_at,
      status
    `
    )
    .eq("contact_id", contact.id)
    .order("send_at", { ascending: true })
    .limit(200);

  if (error || !data) {
    console.error("Error loading outbound emails:", error);
    return [];
  }

  return data as OutboundRow[];
}

async function loadReplies(
  lead: LeadRow,
  contact: ContactRow | null
): Promise<ReplyRow[]> {
  const email = contact?.email ?? lead.email;
  if (!email) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from("email_replies")
    .select(
      `
      id,
      workspace_id,
      campaign_id,
      from_email,
      from_name,
      subject,
      preview,
      received_at,
      intent
    `
    )
    .eq("workspace_id", lead.workspace_id)
    .ilike("from_email", email)
    .order("received_at", { ascending: true });

  if (error || !data) {
    console.error("Error loading replies:", error);
    return [];
  }

  return data as ReplyRow[];
}

async function loadTasks(
  lead: LeadRow,
  contact: ContactRow | null
): Promise<TaskRow[]> {
  if (!contact) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from("followup_tasks")
    .select(
      `
      id,
      workspace_id,
      campaign_id,
      contact_id,
      reply_id,
      task_type,
      due_at,
      completed_at,
      created_at
    `
    )
    .eq("workspace_id", lead.workspace_id)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("Error loading followup_tasks:", error);
    return [];
  }

  return data as TaskRow[];
}

async function loadCallNotes(
  lead: LeadRow,
  contact: ContactRow | null
): Promise<CallNotes> {
  const supabase = createClient();
  const contactId = contact?.id || lead.contact_id;
  if (!contactId) return null;

  // Find the most recent inbox thread for this contact and surface call notes.
  const { data, error } = await supabase
    .from("inbox_threads")
    .select("call_notes_address, call_notes_issue_type, call_notes_urgency, call_notes_generated_at, last_message_at")
    .eq("contact_id", contactId)
    .order("call_notes_generated_at", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const row: any = data[0];
  const hasAny = Boolean(
    row.call_notes_address || row.call_notes_issue_type || row.call_notes_urgency
  );
  if (!hasAny) return null;

  return {
    address: row.call_notes_address || null,
    issueType: row.call_notes_issue_type || null,
    urgency: row.call_notes_urgency || null,
    generatedAt: row.call_notes_generated_at || null,
  };
}

export default async function LeadDetailPage({
  params,
}: LeadPageProps) {
  const lead = await loadLead(params.id);

  if (!lead) {
    notFound();
  }

  const contact = await loadContact(lead);

  const [outbound, replies, tasks, callNotes] = await Promise.all([
    loadOutbound(lead, contact),
    loadReplies(lead, contact),
    loadTasks(lead, contact),
    loadCallNotes(lead, contact),
  ]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <LeadDetailClient
        lead={lead}
        contact={contact}
        outbound={outbound}
        replies={replies}
        tasks={tasks}
        callNotes={callNotes}
      />
      
      {/* Lead Outcome Controls */}
      <div className="max-w-md">
        <LeadOutcomeControls
          leadId={lead.id}
          initialOutcome={lead.outcome}
          initialWonValue={lead.won_value}
          initialLostReason={lead.lost_reason}
        />
      </div>
      
      {/* Call History Section */}
      <section>
        <CallHistory leadId={lead.id} />
      </section>

      <section className="flex-1 overflow-y-auto">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-neutral-50">
            Lead Activity Timeline
          </h2>
          <p className="text-sm text-neutral-400">
            All emails and replies for this homeowner in chronological order.
          </p>
        </header>
        <LeadTimeline leadId={lead.id} />
      </section>
    </div>
  );
}
