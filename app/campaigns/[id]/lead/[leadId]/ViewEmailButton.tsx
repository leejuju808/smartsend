"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resendFromLog } from "./actions";

export default function ViewEmailButton({ 
  logId, 
  campaignId, 
  leadId,
  providerUrl
}: { 
  logId: string; 
  campaignId: string; 
  leadId: string;
  providerUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailData, setEmailData] = useState<{
    subject: string | null;
    html: string | null;
  } | null>(null);

  async function loadEmail() {
    if (emailData) return; // Already loaded
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("send_logs")
        .select("subject_rendered, html_rendered")
        .eq("id", logId)
        .single();

      if (error) throw error;
      setEmailData({
        subject: data?.subject_rendered ?? null,
        html: data?.html_rendered ?? null,
      });
    } catch (err) {
      console.error("Failed to load email:", err);
      alert("Failed to load email");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!emailData) loadEmail();
  }

  function copyHtml() {
    if (emailData?.html) {
      navigator.clipboard.writeText(emailData.html);
      alert("HTML copied to clipboard");
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
      >
        View email
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Email Preview</h2>
              <div className="flex items-center gap-2">
                <form
                  action={async () => {
                    "use server";
                    await resendFromLog(campaignId, leadId, logId);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
                    onClick={(e) => {
                      if (!confirm("Resend this exact email?")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Resend this email
                  </button>
                </form>
                {emailData?.html && (
                  <button
                    onClick={copyHtml}
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
                  >
                    Copy raw HTML
                  </button>
                )}
                {providerUrl && (
                  <a
                    href={providerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
                  >
                    Open in provider
                  </a>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-zinc-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {loading && <div className="text-sm">Loading...</div>}
              {!loading && emailData && (
                <>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Subject</div>
                    <div className="font-medium">{emailData.subject || "(no subject)"}</div>
                  </div>
                  {emailData.html ? (
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">HTML</div>
                      <div className="border rounded-lg p-4 bg-white">
                        <iframe
                          srcDoc={emailData.html}
                          className="w-full h-[600px] border rounded"
                          title="Email preview"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">No HTML content available</div>
                  )}
                </>
              )}
              {!loading && !emailData && (
                <div className="text-sm text-zinc-500">Email not found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

