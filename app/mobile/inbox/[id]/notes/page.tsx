"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Mic, MicOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Feature C — Voice-to-Text Notes on Leads
 * Roofers speak into phone → SmartSend stores it inside the lead profile
 */
export default function MobileVoiceNotesPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.id as string;

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [saved, setSaved] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (mediaRecorder && recording) {
        mediaRecorder.stop();
      }
    };
  }, [mediaRecorder, recording]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        setAudioChunks(chunks);
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
      setSaved(false);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Failed to access microphone. Please allow microphone permissions.");
    }
  }

  function stopRecording() {
    if (mediaRecorder && recording) {
      mediaRecorder.stop();
      setRecording(false);
    }
  }

  async function transcribeAudio(audioBlob: Blob) {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("lead_id", leadId);

      const res = await fetch("/api/mobile/inbox/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to transcribe audio");
        return;
      }

      setTranscript(data.transcript);
    } catch (error) {
      console.error("Error transcribing:", error);
      alert("Failed to transcribe audio");
    } finally {
      setTranscribing(false);
    }
  }

  async function saveNote() {
    if (!transcript.trim()) {
      alert("No transcript to save");
      return;
    }

    try {
      const res = await fetch(`/api/mobile/inbox/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: transcript,
          source: "voice",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save note");
        return;
      }

      setSaved(true);
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Failed to save note");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Voice Note</h1>
            <p className="text-xs text-gray-600">Speak your notes</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
        {/* Recording Button */}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          className={`w-32 h-32 rounded-full flex items-center justify-center ${
            recording
              ? "bg-red-500 animate-pulse"
              : transcribing
              ? "bg-gray-300"
              : "bg-blue-500"
          } text-white shadow-lg`}
        >
          {transcribing ? (
            <Loader2 className="h-12 w-12 animate-spin" />
          ) : recording ? (
            <MicOff className="h-12 w-12" />
          ) : (
            <Mic className="h-12 w-12" />
          )}
        </button>

        {/* Status Text */}
        <div className="text-center">
          {recording && (
            <div className="text-lg font-semibold text-red-600">
              Recording... Tap to stop
            </div>
          )}
          {transcribing && (
            <div className="text-lg font-semibold text-blue-600">
              Transcribing...
            </div>
          )}
          {!recording && !transcribing && (
            <div className="text-lg font-semibold text-gray-700">
              Tap to start recording
            </div>
          )}
        </div>

        {/* Transcript */}
        {transcript && (
          <div className="w-full bg-white rounded-lg p-4 border">
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Transcript:
            </div>
            <div className="text-sm text-gray-900 whitespace-pre-wrap">
              {transcript}
            </div>
          </div>
        )}

        {/* Save Button */}
        {transcript && !saved && (
          <button
            onClick={saveNote}
            className="w-full bg-green-500 text-white py-4 rounded-lg font-semibold"
          >
            Save Note
          </button>
        )}

        {saved && (
          <div className="text-green-600 font-semibold">
            Note saved! ✓
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="px-4 pb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          💡 Speak naturally. SmartSend will convert your voice to text and save it to the lead profile.
        </div>
      </div>
    </div>
  );
}






































