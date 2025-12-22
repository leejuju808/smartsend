// Block 19900 — Voicemail → Inbox
// POST /api/lead-capture/voicemail
// Transcribes voicemail and creates inbox thread

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspace_id,
      caller_phone,
      caller_name,
      audio_url,
      duration_seconds,
      metadata = {},
    } = body;

    if (!workspace_id || !caller_phone || !audio_url || !duration_seconds) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: workspace_id, caller_phone, audio_url, duration_seconds",
        },
        { status: 400 }
      );
    }

    // Find or create contact by phone
    let contactId: string | null = null;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("phone", caller_phone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          workspace_id,
          phone: caller_phone,
          first_name: caller_name || null,
          email: null,
          lead_source: "voicemail",
          source_meta: {
            created_from: "voicemail",
            caller_name: caller_name || null,
          },
        })
        .select()
        .single();

      if (contactError || !newContact) {
        console.error("Error creating contact:", contactError);
        return NextResponse.json(
          { error: "Failed to create contact" },
          { status: 500 }
        );
      }

      contactId = newContact.id;
    }

    // Create voicemail record
    const { data: voicemail, error: voicemailError } = await supabase
      .from("voicemails")
      .insert({
        workspace_id,
        contact_id: contactId,
        caller_phone,
        caller_name: caller_name || null,
        audio_url,
        duration_seconds,
        transcript_status: "processing",
        metadata,
      })
      .select()
      .single();

    if (voicemailError) {
      console.error("Error creating voicemail record:", voicemailError);
      return NextResponse.json(
        { error: "Failed to create voicemail record" },
        { status: 500 }
      );
    }

    // Transcribe voicemail (async)
    const transcript = await transcribeVoicemail(audio_url);

    // Update voicemail with transcript
    await supabase
      .from("voicemails")
      .update({
        transcript: transcript.text,
        transcript_status: transcript.success ? "completed" : "failed",
        transcripted_at: new Date().toISOString(),
      })
      .eq("id", voicemail.id);

    // Analyze voicemail with AI
    const analysis = await analyzeVoicemail(transcript.text || "");

    // Update voicemail with analysis
    await supabase
      .from("voicemails")
      .update({
        ai_summary: analysis.summary,
        urgency_level: analysis.urgency_level,
        lead_score: analysis.lead_score,
      })
      .eq("id", voicemail.id);

    // Create inbox thread
    const subject = `Voicemail (${formatDuration(duration_seconds)})`;
    const messageBody = [
      `Voicemail from ${caller_name || caller_phone}`,
      "",
      `**Call Details:**`,
      `- Phone: ${caller_phone}`,
      `- Caller Name: ${caller_name || "Unknown"}`,
      `- Duration: ${formatDuration(duration_seconds)}`,
      `- Time: ${new Date().toLocaleString()}`,
      "",
      `**Transcript:**`,
      transcript.text || "Transcription unavailable",
      "",
      analysis.summary ? `**AI Summary:**\n${analysis.summary}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id,
        contact_id: contactId,
        subject,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (threadError || !thread) {
      console.error("Error creating thread:", threadError);
      return NextResponse.json(
        { error: "Failed to create inbox thread" },
        { status: 500 }
      );
    }

    // Create initial message
    await supabase.from("inbox_messages").insert({
      thread_id: thread.id,
      sender: caller_phone,
      body: messageBody,
      sent_at: new Date().toISOString(),
      is_incoming: true,
    });

    // Update voicemail with thread_id
    await supabase
      .from("voicemails")
      .update({ thread_id: thread.id })
      .eq("id", voicemail.id);

    // Run Smart Intake Parser
    await processSmartIntake({
      workspace_id,
      contact_id: contactId,
      thread_id: thread.id,
      source_type: "voicemail",
      source_id: voicemail.id,
      submission_data: {
        transcript: transcript.text,
        duration: duration_seconds,
        caller_name,
      },
    });

    // Create follow-up task
    const taskPriority =
      analysis.urgency_level === "urgent" || analysis.urgency_level === "high"
        ? "high"
        : "medium";

    await supabase.from("tasks").insert({
      workspace_id,
      contact_id: contactId,
      thread_id: thread.id,
      title: "Follow up on voicemail",
      description: `Voicemail from ${caller_name || caller_phone}. ${analysis.summary || ""}`,
      priority: taskPriority,
      status: "open",
      due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      auto_generated: true,
      auto_source: "voicemail",
    });

    return NextResponse.json({
      success: true,
      contact_id: contactId,
      thread_id: thread.id,
      voicemail_id: voicemail.id,
      transcript: transcript.text,
      urgency_level: analysis.urgency_level,
      lead_score: analysis.lead_score,
    });
  } catch (error: any) {
    console.error("Error processing voicemail:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Transcribe voicemail audio
async function transcribeVoicemail(
  audioUrl: string
): Promise<{ text: string | null; success: boolean }> {
  try {
    // Use OpenAI Whisper API or your transcription service
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn("OpenAI API key not found, skipping transcription");
      return { text: null, success: false };
    }

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error("Failed to download audio file");
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioFile = new File([audioBuffer], "voicemail.mp3", {
      type: "audio/mpeg",
    });

    // Transcribe with OpenAI Whisper
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { text: data.text || null, success: true };
  } catch (error) {
    console.error("Error transcribing voicemail:", error);
    return { text: null, success: false };
  }
}

// Analyze voicemail transcript
async function analyzeVoicemail(
  transcript: string
): Promise<{
  summary: string;
  urgency_level: string;
  lead_score: number;
}> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return getFallbackAnalysis(transcript);
    }

    const prompt = `Analyze this voicemail transcript from a roofing lead and provide:
1. A brief summary (2-3 sentences)
2. Urgency level: "low", "medium", "high", or "urgent"
3. Lead score: 0-100

Transcript:
${transcript}

Respond with JSON only: {"summary": "...", "urgency_level": "...", "lead_score": ...}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a roofing lead intelligence system. Respond with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in AI response");
    }

    const analysis = JSON.parse(content);
    return {
      summary: analysis.summary || "",
      urgency_level: analysis.urgency_level || "medium",
      lead_score: analysis.lead_score || 50,
    };
  } catch (error) {
    console.error("Error analyzing voicemail:", error);
    return getFallbackAnalysis(transcript);
  }
}

// Fallback analysis
function getFallbackAnalysis(transcript: string): {
  summary: string;
  urgency_level: string;
  lead_score: number;
} {
  const lowerTranscript = transcript.toLowerCase();
  let urgency = "medium";
  let leadScore = 50;

  if (
    lowerTranscript.includes("urgent") ||
    lowerTranscript.includes("emergency") ||
    lowerTranscript.includes("leak")
  ) {
    urgency = "urgent";
    leadScore = 80;
  } else if (
    lowerTranscript.includes("storm") ||
    lowerTranscript.includes("damage")
  ) {
    urgency = "high";
    leadScore = 70;
  }

  const summary = transcript.length > 200 ? transcript.substring(0, 200) + "..." : transcript;

  return {
    summary,
    urgency_level: urgency,
    lead_score: leadScore,
  };
}

// Format duration in MM:SS format
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Helper: Process Smart Intake
async function processSmartIntake(params: any) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/lead-capture/smart-intake`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    );
  } catch (error) {
    console.error("Error calling Smart Intake Parser:", error);
  }
}



















































