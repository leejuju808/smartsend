// Block 87000 — Call Detail View
// Shows full call details, transcript, AI summary, and actions

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import Link from "next/link";
import { formatPhoneNumber } from "@/lib/phone-utils";

export const metadata: Metadata = {
  title: "Call Details · SmartSend",
};

export default async function CallDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  // Fetch call details
  const { data: call, error } = await supabase
    .from("call_logs")
    .select(
      `
      *,
      leads(id, email, first_name, last_name, phone, status),
      missed_call_texts(id, message, status, homeowner_responded, created_at)
    `
    )
    .eq("id", params.id)
    .single();

  if (error || !call) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4">Call Not Found</h1>
        <Link href="/phone" className="text-primary hover:underline">
          Back to Phone Dashboard
        </Link>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      answered: { label: "Answered", className: "bg-green-100 text-green-800" },
      missed: { label: "Missed", className: "bg-red-100 text-red-800" },
      no_answer: { label: "No Answer", className: "bg-red-100 text-red-800" },
      ai_answered: { label: "AI Answered", className: "bg-blue-100 text-blue-800" },
      voicemail: { label: "Voicemail", className: "bg-yellow-100 text-yellow-800" },
      busy: { label: "Busy", className: "bg-gray-100 text-gray-800" },
      failed: { label: "Failed", className: "bg-gray-100 text-gray-800" },
    };

    const config = statusConfig[status] || {
      label: status,
      className: "bg-gray-100 text-gray-800",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${config.className}`}
      >
        {config.label}
      </span>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Call Details</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(call.started_at)}
          </p>
        </div>
        <Link
          href="/phone"
          className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
        >
          Back to Dashboard
        </Link>
      </header>

      {/* Call Info Card */}
      <div className="bg-card border rounded-lg p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">From</p>
            <p className="text-lg font-semibold">{formatPhoneNumber(call.from_number)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">To</p>
            <p className="text-lg font-semibold">{formatPhoneNumber(call.to_number)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Status</p>
            {getStatusBadge(call.call_status)}
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Duration</p>
            <p className="text-lg">{formatDuration(call.duration_seconds)}</p>
          </div>
          {call.twilio_call_sid && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Call SID</p>
              <p className="text-sm font-mono">{call.twilio_call_sid}</p>
            </div>
          )}
          {call.twilio_recording_url && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Recording</p>
              <a
                href={call.twilio_recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                Listen to Recording
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Captured Information */}
      {(call.captured_name || call.captured_address || call.captured_issue) && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Captured Information</h2>
          <div className="space-y-3">
            {call.captured_name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Name</p>
                <p className="text-base">{call.captured_name}</p>
              </div>
            )}
            {call.captured_address && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Address</p>
                <p className="text-base">{call.captured_address}</p>
              </div>
            )}
            {call.captured_issue && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Issue</p>
                <p className="text-base">{call.captured_issue}</p>
              </div>
            )}
            {call.inspection_booked && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Inspection</p>
                <p className="text-base">
                  {call.inspection_date
                    ? `Booked for ${formatDate(call.inspection_date)}`
                    : "Booked (date TBD)"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {call.ai_summary && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">AI Summary</h2>
          <p className="text-base whitespace-pre-wrap">{call.ai_summary}</p>
          {call.ai_intent && (
            <div className="mt-4 flex items-center gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Intent</p>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    call.ai_intent === "high"
                      ? "bg-red-100 text-red-800"
                      : call.ai_intent === "medium"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {call.ai_intent.toUpperCase()}
                </span>
              </div>
              {call.ai_urgency && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Urgency</p>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      call.ai_urgency === "urgent"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {call.ai_urgency.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {call.transcript && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Call Transcript</h2>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm whitespace-pre-wrap font-mono">{call.transcript}</p>
          </div>
        </div>
      )}

      {/* Text-Back History */}
      {call.missed_call_texts && call.missed_call_texts.length > 0 && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Text-Back History</h2>
          <div className="space-y-3">
            {call.missed_call_texts.map((text: any) => (
              <div key={text.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {formatDate(text.created_at)}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      text.status === "sent" || text.status === "delivered"
                        ? "bg-green-100 text-green-800"
                        : text.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {text.status}
                  </span>
                </div>
                <p className="text-sm mb-2">{text.message}</p>
                {text.homeowner_responded && (
                  <p className="text-xs text-green-600">✓ Homeowner responded</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked Lead */}
      {call.lead_id && call.leads && (
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Linked Lead</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {call.leads.first_name} {call.leads.last_name}
              </p>
              <p className="text-sm text-muted-foreground">{call.leads.email}</p>
              {call.leads.phone && (
                <p className="text-sm text-muted-foreground">
                  {formatPhoneNumber(call.leads.phone)}
                </p>
              )}
            </div>
            <Link
              href={`/leads/${call.lead_id}`}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              View Lead
            </Link>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        {!call.lead_id && (
          <form
            action={async () => {
              "use server";
              const supabase = await getServerSupabase();
              // Create lead from call
              const { data: newLead } = await supabase
                .from("leads")
                .insert({
                  workspace_id: workspaceId,
                  phone: call.from_number,
                  source: "phone_call",
                  status: "new",
                  notes: call.ai_summary || `Call from ${call.from_number}`,
                })
                .select()
                .single();

              if (newLead) {
                await supabase
                  .from("call_logs")
                  .update({ lead_id: newLead.id })
                  .eq("id", call.id);
              }
            }}
          >
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Create Lead from Call
            </button>
          </form>
        )}
      </div>
    </div>
  );
}



























