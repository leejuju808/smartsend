"use client";
import { useState } from "react";

interface TestSendModalProps {
  provider: "google";
  orgId: string;
  onClose: () => void;
  onSend: () => void;
}

export default function TestSendModal({ provider, orgId, onClose, onSend }: TestSendModalProps) {
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("Test Email");
  const [body, setBody] = useState("This is a test email from SmartSend AI.");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Call the enqueue API
      const res = await fetch("/api/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          to_email: toEmail,
          subject: subject || "Test Email",
          body: body || "This is a test email from SmartSend AI.",
          connector: provider, // gmail
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send email");
      }

      onSend();
      alert("✅ Test email queued successfully! Check your queue status.");
    } catch (err: any) {
      setError(err.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Send Test Email</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Email
            </label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={sending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Test Email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={sending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="This is a test email from SmartSend AI."
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              disabled={sending}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSend}
              disabled={sending || !toEmail}
              className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-gray-800"
            >
              {sending ? "Sending…" : "Send test"}
            </button>
            <button
              onClick={onClose}
              disabled={sending}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

