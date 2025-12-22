// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/email/process
// Processes incoming emails: categorizes, assigns, creates tasks

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const {
      company_id,
      from_name,
      from_email,
      from_phone,
      subject,
      message,
      lead_id,
      job_id,
      contact_id,
    } = body;

    if (!company_id || !from_email || !message) {
      return NextResponse.json(
        { error: "Missing required fields: company_id, from_email, message" },
        { status: 400 }
      );
    }

    // Step 1: AI Analysis - Categorize and extract information
    const analysisPrompt = `You are SmartSend's AI Office Admin Assistant for a roofing company.

Analyze this incoming email and extract:
1. Category: one of ('warranty_issue', 'new_lead', 'scheduling', 'payment', 'general', 'complaint', 'question', 'follow_up', 'estimate_request', 'job_status')
2. Urgency: one of ('low', 'normal', 'high', 'urgent')
3. Sentiment: one of ('positive', 'neutral', 'negative', 'frustrated')
4. Summary: brief 1-2 sentence summary
5. Extracted data: JSON object with any relevant info (job numbers, dates, amounts, customer names, etc.)
6. Suggested assignment: role type ('pm', 'sales', 'admin', 'office_staff', 'none')
7. Suggested task: if a task should be created, what should it be? (null if no task needed)

Email:
Subject: ${subject || "(no subject)"}
From: ${from_name || ""} <${from_email}>
Message: ${message}

Return ONLY valid JSON:
{
  "category": "",
  "urgency": "",
  "sentiment": "",
  "summary": "",
  "extracted_data": {},
  "suggested_assignment": "",
  "suggested_task": null or "task description"
}`;

    const analysisCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful AI assistant that analyzes emails for roofing companies." },
        { role: "user", content: analysisPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const analysisText = analysisCompletion.choices[0]?.message?.content || "{}";
    const analysis = JSON.parse(analysisText);

    // Step 2: Find or create contact/lead
    let finalLeadId = lead_id;
    let finalContactId = contact_id;
    let finalJobId = job_id;

    if (!finalLeadId && from_email) {
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("email", from_email)
        .maybeSingle();

      if (existingLead) {
        finalLeadId = existingLead.id;
      }
    }

    // Step 3: Find appropriate office user to assign
    let assignedTo: string | null = null;

    if (analysis.suggested_assignment && analysis.suggested_assignment !== "none") {
      const roleMap: Record<string, string[]> = {
        pm: ["office_manager", "office_staff"],
        sales: ["office_staff", "admin"],
        admin: ["admin", "office_manager"],
        office_staff: ["office_staff", "admin"],
      };

      const roles = roleMap[analysis.suggested_assignment] || ["office_staff"];

      const { data: officeUser } = await supabase
        .from("office_users")
        .select("id")
        .eq("company_id", company_id)
        .eq("is_active", true)
        .in("role", roles)
        .limit(1)
        .maybeSingle();

      if (officeUser) {
        assignedTo = officeUser.id;
      }
    }

    // Step 4: Create inbox entry
    const { data: inboxItem, error: inboxError } = await supabase
      .from("office_inbox")
      .insert({
        company_id,
        source: "email",
        from_name,
        from_email,
        from_phone,
        subject,
        message,
        ai_category: analysis.category,
        ai_urgency: analysis.urgency,
        ai_sentiment: analysis.sentiment,
        ai_summary: analysis.summary,
        ai_extracted_data: analysis.extracted_data || {},
        assigned_to: assignedTo,
        assigned_at: assignedTo ? new Date().toISOString() : null,
        priority: analysis.urgency,
        status: assignedTo ? "open" : "new",
        lead_id: finalLeadId,
        job_id: finalJobId,
        contact_id: finalContactId,
      })
      .select()
      .single();

    if (inboxError || !inboxItem) {
      console.error("Error creating inbox item:", inboxError);
      return NextResponse.json(
        { error: "Failed to create inbox item" },
        { status: 500 }
      );
    }

    // Step 5: Create task if suggested
    let taskId: string | null = null;
    if (analysis.suggested_task) {
      const { data: task, error: taskError } = await supabase
        .from("office_tasks")
        .insert({
          company_id,
          inbox_id: inboxItem.id,
          task: analysis.suggested_task,
          description: analysis.summary,
          task_type: analysis.category === "scheduling" ? "scheduling" : 
                     analysis.category === "payment" ? "admin" :
                     analysis.category === "warranty_issue" ? "pm_task" :
                     analysis.category === "new_lead" ? "sales_followup" : "general",
          assigned_to: assignedTo,
          assigned_at: assignedTo ? new Date().toISOString() : null,
          priority: analysis.urgency,
          status: "open",
          lead_id: finalLeadId,
          job_id: finalJobId,
          due_date: analysis.urgency === "urgent" || analysis.urgency === "high" 
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        })
        .select()
        .single();

      if (!taskError && task) {
        taskId = task.id;
      }
    }

    // Step 6: Log activity
    await supabase.from("office_activity_log").insert({
      company_id,
      activity_type: "email_processed",
      inbox_id: inboxItem.id,
      lead_id: finalLeadId,
      job_id: finalJobId,
      performed_by_ai: true,
      details: {
        category: analysis.category,
        urgency: analysis.urgency,
        assigned: !!assignedTo,
        task_created: !!taskId,
      },
    });

    return NextResponse.json({
      success: true,
      inbox_id: inboxItem.id,
      task_id: taskId,
      analysis: {
        category: analysis.category,
        urgency: analysis.urgency,
        sentiment: analysis.sentiment,
        summary: analysis.summary,
      },
      assigned_to: assignedTo,
    });
  } catch (error: any) {
    console.error("Error processing email:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process email" },
      { status: 500 }
    );
  }
}





















