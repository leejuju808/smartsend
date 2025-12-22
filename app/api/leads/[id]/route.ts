import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Fetch lead
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Fetch email threads for this lead
  const { data: threads, error: threadsErr } = await supabase
    .from("email_threads")
    .select("*")
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false });

  if (threadsErr) {
    console.error("Threads error:", threadsErr);
  }

  const thread = threads?.[0] ?? null;

  // Fetch emails for the thread
  let emails: any[] = [];
  if (thread?.id) {
    const { data: emailsData, error: emailsErr } = await supabase
      .from("emails")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });

    if (emailsErr) {
      console.error("Emails error:", emailsErr);
    } else {
      emails = emailsData || [];
    }
  }

  // Fetch tasks for this lead
  // Try ordering by due_date first, fallback to due_at
  let tasks: any[] = [];
  const { data: tasksData, error: tasksErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("lead_id", leadId);

  if (tasksErr) {
    console.error("Tasks error:", tasksErr);
  } else {
    tasks = (tasksData || []).sort((a, b) => {
      const dateA = a.due_date || a.due_at;
      const dateB = b.due_date || b.due_at;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  }

  // Fetch job value estimate
  // Try to get from job_value_estimates view/table via lead_id
  // If that doesn't work, try via contacts table
  let value = null;
  const { data: valueData, error: valueErr } = await supabase
    .from("job_value_estimates")
    .select("*")
    .eq("lead_id", leadId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (valueErr) {
    // Try alternative: check if job_value_estimates is a view that uses contacts
    // and we need to join through contacts
    const { data: contactValue } = await supabase
      .from("job_value_estimates")
      .select("*")
      .limit(1);
    
    // If that doesn't work, try contacts table directly
    if (!contactValue) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("estimated_value_min, estimated_job_value, est_job_value, close_probability, estimated_value_confidence")
        .eq("email", lead.email)
        .maybeSingle();
      
      if (contact) {
        value = {
          base_amount: contact.estimated_value_min || contact.estimated_job_value || contact.est_job_value || 0,
          expected_value: (contact.estimated_value_min || contact.estimated_job_value || contact.est_job_value || 0) * 
            (contact.close_probability ? contact.close_probability / 100 : contact.estimated_value_confidence || 0.5),
        };
      }
    }
  } else {
    value = valueData?.[0] ?? null;
  }

  // Fetch activity log
  const { data: history, error: historyErr } = await supabase
    .from("activity_log")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (historyErr) {
    console.error("History error:", historyErr);
  }

  return NextResponse.json({
    lead,
    thread,
    emails: emails || [],
    tasks: tasks || [],
    value: value,
    history: history || [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  const body = await req.json();
  const updates: Record<string, any> = {};

  // Only update fields that are provided
  if (body.email !== undefined) updates.email = body.email;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.linkedin !== undefined) updates.linkedin = body.linkedin;
  if (body.website !== undefined) updates.website = body.website;
  if (body.first_name !== undefined) updates.first_name = body.first_name;
  if (body.last_name !== undefined) updates.last_name = body.last_name;
  if (body.company !== undefined) updates.company = body.company;
  if (body.title !== undefined) updates.title = body.title;
  if (body.tags !== undefined) updates.tags = body.tags; // Array of strings
  if (body.owner_id !== undefined) updates.owner_id = body.owner_id; // UUID or null
  
  // Block 8490 — Lead Status & Follow-Up Controls
  if (typeof body.status === "string") updates.status = body.status;
  if (body.next_follow_up_at !== undefined) updates.next_follow_up_at = body.next_follow_up_at;
  if (body.last_contacted_at !== undefined) updates.last_contacted_at = body.last_contacted_at;

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}


