import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/inbox/transcribe
 * Transcribe audio to text using speech-to-text service
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const leadId = formData.get("lead_id") as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Convert audio to text using OpenAI Whisper API or similar
    const transcript = await transcribeAudio(audioFile);

    return NextResponse.json({
      ok: true,
      transcript,
    });
  } catch (error: any) {
    console.error("Error transcribing audio:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}

/**
 * Transcribe audio using OpenAI Whisper API
 * Replace with your preferred speech-to-text service
 */
async function transcribeAudio(audioFile: File): Promise<string> {
  // TODO: Integrate with OpenAI Whisper API or similar service
  // Example using OpenAI:
  /*
  const formData = new FormData();
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data.text;
  */

  // For now, return mock transcript
  // In production, use OpenAI Whisper, Google Speech-to-Text, AWS Transcribe, etc.
  return "Homeowner says they need repair on back side. Willing to schedule inspection this week.";
}






































