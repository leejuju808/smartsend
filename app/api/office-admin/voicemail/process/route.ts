// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/voicemail/process
// Transcribes voicemail, analyzes, assigns, creates tasks

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
      caller_phone,
      caller_name,
      audio_url,
      duration_seconds,
      voicemail_id, // Optional: if voicemail already exists in voicemails table
    } = body;

    if (!company_id || !caller_phone || !audio_url) {
      return NextResponse.json(
        { error: "Missing required fields: company_id, caller_phone, audio_url" },
        { status: 400 }
      );
    }

    // Step 1: Transcribe voicemail using OpenAI Whisper
    let transcription = "";
    try {
      const audioResponse = await fetch(audio_url);
      const audioBuffer = await audioResponse.arrayBuffer();
      const audioFile = new File([audioBuffer], "voicemail.mp3", { type: "audio/mpeg" });

      const transcriptResponse = await openai.audio.transcriptions.create({
        file: audioFile as any,
        model: "whisper-1",
        language: "en",
      });

      transcription = transcriptResponse.text;
    } catch (transcribeError: any) {
      console.error("Error transcribing voicemail:", transcribeError);
      // Continue without transcription
      transcription = "[Transcription failed]";
    }

    // Step 2: Find or create contact/lead
    let leadId: string | null = null;
    let contactId: string | null = null;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id, lead_id")
      .eq("phone", caller_phone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      leadId = existingContact.lead_id || null;
    } else if (caller_phone) {
      // Create new contact
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          phone: caller_phone,
          first_name: caller_name || null,
          lead_source: "voicemail",
        })
        .select()
        .single();

      if (newContact) {
        contactId = newContact.id;
      }
    }

    // Step 3: AI Analysis
    const analysisPrompt = `You are SmartSend's AI Office Admin Assistant for a roofing company.

Analyze this voicemail transcription and extract:
1. Category: one of ('warranty_issue', 'new_lead', 'scheduling', 'payment', 'general', 'complaint', 'question', 'follow_up', 'estimate_request', 'job_status')
2. Urgency: one of ('low', 'normal', 'high', 'urgent')
3. Sentiment: one of ('positive', 'neutral', 'negative', 'frustrated')
4. Summary: brief 1-2 sentence summary
5. Extracted data: JSON object with any relevant info (job numbers, dates, customer names, etc.)
6. Suggested assignment: role type ('pm', 'sales', 'admin', 'office_staff', 'none')
7. Suggested task: if a task should be created, what should it be? (null if no task needed)
8. Suggested reply: draft a brief, professional reply message

Voicemail:
From: ${caller_name || "Unknown"} (${caller_phone})
Duration: ${duration_seconds} seconds
Transcript: ${transcription}

Return ONLY valid JSON:
{
  "category": "",
  "urgency": "",
  "sentiment": "",
  "summary": "",
  "extracted_data": {},
  "suggested_assignment": "",
  "suggested_task": null or "task description",
  "suggested_reply": ""
}`;

    const analysisCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful AI assistant that analyzes voicemails for roofing companies." },
        { role: "user", content: analysisPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const analysisText = analysisCompletion.choices[0]?.message?.content || "{}";
    const analysis = JSON.parse(analysisText);

    // Step 4: Find appropriate office user to assign
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

    // Step 5: Create inbox entry
    const { data: inboxItem, error: inboxError } = await supabase
      .from("office_inbox")
      .insert({
        company_id,
        source: "voicemail",
        from_name: caller_name,
        from_phone: caller_phone,
        subject: `Voicemail from ${caller_name || caller_phone}`,
        message: `Voicemail received (${duration_seconds}s)`,
        transcription,
        ai_category: analysis.category,
        ai_urgency: analysis.urgency,
        ai_sentiment: analysis.sentiment,
        ai_summary: analysis.summary,
        ai_extracted_data: analysis.extracted_data || {},
        assigned_to: assignedTo,
        assigned_at: assignedTo ? new Date().toISOString() : null,
        priority: analysis.urgency,
        status: assignedTo ? "open" : "new",
        lead_id: leadId,
        contact_id: contactId,
        response_draft: analysis.suggested_reply || null,
        metadata: {
          audio_url,
          duration_seconds,
          voicemail_id,
        },
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

    // Step 6: Create task if suggested
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
          lead_id: leadId,
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

    // Step 7: Log activities
    await supabase.from("office_activity_log").insert([
      {
        company_id,
        activity_type: "voicemail_received",
        inbox_id: inboxItem.id,
        lead_id: leadId,
        performed_by_ai: true,
        details: {
          caller_phone,
          duration_seconds,
        },
      },
      {
        company_id,
        activity_type: "voicemail_transcribed",
        inbox_id: inboxItem.id,
        lead_id: leadId,
        performed_by_ai: true,
        details: {
          transcription_length: transcription.length,
        },
      },
    ]);

    return NextResponse.json({
      success: true,
      inbox_id: inboxItem.id,
      task_id: taskId,
      transcription,
      analysis: {
        category: analysis.category,
        urgency: analysis.urgency,
        sentiment: analysis.sentiment,
        summary: analysis.summary,
      },
      suggested_reply: analysis.suggested_reply,
      assigned_to: assignedTo,
    });
  } catch (error: any) {
    console.error("Error processing voicemail:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process voicemail" },
      { status: 500 }
    );
  }
}





















