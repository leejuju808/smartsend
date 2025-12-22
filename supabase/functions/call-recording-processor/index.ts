// Block 30988 — SmartSend Roofing "SmartPhone → CRM Sync + Call Recording Intelligence" v1
// Edge Function: /call-recording-processor
// 
// Processes call recordings: transcribes audio, analyzes for buying signals, creates tasks, updates lead scores

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.56.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { call_id, recording_url } = await req.json();

    if (!call_id || !recording_url) {
      return new Response(
        JSON.stringify({ error: "call_id and recording_url required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1️⃣ Update recording status to processing
    await supabase
      .from("call_recordings")
      .update({ transcription_status: "processing" })
      .eq("call_id", call_id);

    // 2️⃣ Transcribe audio using OpenAI Whisper
    let transcription = "";
    try {
      // Download the audio file from the URL
      const audioResponse = await fetch(recording_url);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
      }

      const audioBlob = await audioResponse.blob();
      
      // Convert Blob to File for OpenAI API (Deno-compatible)
      // Note: Deno supports File API, but if it doesn't work, we can use the Blob directly
      let audioFile: File | Blob;
      try {
        audioFile = new File([audioBlob], "recording.mp3", {
          type: audioBlob.type || "audio/mpeg",
        });
      } catch {
        // Fallback to Blob if File constructor fails
        audioFile = audioBlob;
      }

      // Transcribe using OpenAI Whisper
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: audioFile as any, // OpenAI SDK accepts File or Blob
        model: "whisper-1",
        language: "en",
      });

      transcription = transcriptionResponse.text;
    } catch (error) {
      console.error("Transcription error:", error);
      await supabase
        .from("call_recordings")
        .update({ transcription_status: "failed" })
        .eq("call_id", call_id);
      throw error;
    }

    // 3️⃣ Save transcription
    const { error: updateError } = await supabase
      .from("call_recordings")
      .update({
        transcription: transcription,
        transcription_status: "completed",
      })
      .eq("call_id", call_id);

    if (updateError) {
      console.error("Error updating transcription:", updateError);
      throw updateError;
    }

    // 4️⃣ Analyze transcript for buying signals
    const analysisPrompt = `Analyze this roofing sales call transcription and identify buying signals, urgency, objections, insurance involvement, storm damage mentions, timeline, and recommended next actions.

Return a JSON object with this exact structure:
{
  "signals": [
    { "label": "buying_signal", "value": 40, "confidence": 0.9, "metadata": { "phrases": ["we're ready", "let's move forward"] } },
    { "label": "urgency", "value": 30, "confidence": 0.8, "metadata": { "phrases": ["ASAP", "as soon as possible"] } },
    { "label": "insurance_involvement", "value": 20, "confidence": 0.95, "metadata": { "phrases": ["insurance is covering it"] } },
    { "label": "storm_damage", "value": 20, "confidence": 0.9, "metadata": { "phrases": ["hail damage", "storm hit"] } },
    { "label": "price_sensitivity", "value": -10, "confidence": 0.7, "metadata": { "phrases": ["too expensive", "getting quotes"] } }
  ],
  "tasks": [
    { "description": "Call homeowner today to finalize appointment", "due_at": null, "priority": "high" },
    { "description": "Email adjuster packet", "due_at": null, "priority": "normal" }
  ],
  "score_boost": 40,
  "summary": "Brief summary of the call and key points"
}

Scoring rules:
- "We're ready" / "Let's move forward" → buying_signal: +40
- "ASAP" / "urgent" / "as soon as possible" → urgency: +30
- "Insurance is covering it" → insurance_involvement: +20
- "Hail damage" / "storm hit" → storm_damage: +20
- "Can you send someone today?" → urgency: +30
- "We're getting quotes" → price_sensitivity: -10
- "Too expensive" → price_sensitivity: -20

Transcript:
${transcription}

Return ONLY valid JSON, no other text.`;

    let analysisResult: any;
    try {
      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a roofing sales intelligence analyzer. Return only valid JSON.",
          },
          { role: "user", content: analysisPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = analysisResponse.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No analysis content returned");
      }

      analysisResult = JSON.parse(content);
    } catch (error) {
      console.error("Analysis error:", error);
      // Continue even if analysis fails - we still have the transcription
      analysisResult = {
        signals: [],
        tasks: [],
        score_boost: 0,
        summary: "Analysis failed",
      };
    }

    // 5️⃣ Get lead_id from call_to_lead_map or call_logs
    let lead_id: string | null = null;

    // Try to get from call_to_lead_map first
    const { data: callMap } = await supabase
      .from("call_to_lead_map")
      .select("lead_id")
      .eq("call_id", call_id)
      .single();

    if (callMap?.lead_id) {
      lead_id = callMap.lead_id;
    } else {
      // Fallback: try to get from call_logs
      const { data: callLog } = await supabase
        .from("call_logs")
        .select("lead_id")
        .eq("id", call_id)
        .single();

      if (callLog?.lead_id) {
        lead_id = callLog.lead_id;
      }
    }

    // 6️⃣ Save insights
    if (analysisResult.signals && Array.isArray(analysisResult.signals)) {
      for (const signal of analysisResult.signals) {
        await supabase.from("call_insights").insert({
          call_id,
          signal: signal.label || "unknown",
          value: signal.value || 0,
          confidence: signal.confidence || 0.5,
          metadata: signal.metadata || {},
        });
      }
    }

    // 7️⃣ Create tasks (only if we have a lead_id)
    if (lead_id && analysisResult.tasks && Array.isArray(analysisResult.tasks)) {
      for (const task of analysisResult.tasks) {
        await supabase.from("call_tasks").insert({
          lead_id,
          call_id,
          task_type: "call_followup",
          description: task.description || "Follow up from call",
          due_at: task.due_at || null,
          priority: task.priority || "normal",
          status: "open",
          auto_generated: true,
          metadata: {
            source: "call_intelligence",
            summary: analysisResult.summary || "",
          },
        });
      }
    }

    // 8️⃣ Update lead score (only if we have a lead_id and score_boost > 0)
    if (lead_id && analysisResult.score_boost > 0) {
      try {
        // Log the score change
        await supabase.from("lead_score_logs").insert({
          lead_id,
          signal: "call_intelligence_boost",
          value: analysisResult.score_boost,
          metadata: {
            call_id,
            summary: analysisResult.summary,
            signals: analysisResult.signals,
          },
        });

        // Update the lead score using the function
        const { data: scoreResult, error: scoreError } = await supabase.rpc(
          "update_lead_score",
          {
            p_lead_id: lead_id,
            p_delta: analysisResult.score_boost,
          }
        );

        if (scoreError) {
          console.error("Error updating lead score:", scoreError);
          // Fallback: update directly if function doesn't exist
          const { data: lead } = await supabase
            .from("leads")
            .select("score")
            .eq("id", lead_id)
            .single();

          if (lead) {
            const currentScore = lead.score || 0;
            const newScore = Math.max(0, Math.min(100, currentScore + analysisResult.score_boost));
            
            // Update score (score_updated_at will be handled by trigger if it exists)
            const updateData: any = { score: newScore };
            await supabase
              .from("leads")
              .update(updateData)
              .eq("id", lead_id);
          }
        }
      } catch (error) {
        console.error("Error in lead score update:", error);
        // Don't fail the whole process if score update fails
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        transcription: transcription.substring(0, 100) + "...", // Preview
        analysis: {
          signals_count: analysisResult.signals?.length || 0,
          tasks_created: analysisResult.tasks?.length || 0,
          score_boost: analysisResult.score_boost || 0,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing call recording:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});


































