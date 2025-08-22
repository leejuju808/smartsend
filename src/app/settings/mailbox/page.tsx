"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

export default function MailboxSettingsPage() {
  const sb = createClientComponentClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<"gmail" | "outlook" | "smtp">("gmail");
  const [status, setStatus] = useState<{ provider?: string; verified?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [smtp, setSmtp] = useState({
    from_email: "",
    from_name: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_secure: false,
    smtp_user: "",
    smtp_pass: "",
  });
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, []);

  function connectGmail() {
    if (!userId) return;
    window.location.href = `/api/mail/gmail/start?userId=${userId}`;
  }

  function connectOutlook() {
    if (!userId) return;
    window.location.href = `/api/auth/start/outlook?userId=${userId}`;
  }

  async function saveSMTP() {
    if (!userId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/mail/save-smtp?userId=${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(smtp),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to save SMTP");
      alert("SMTP saved. Now send a test.");
      setTab("smtp");
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!userId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/mail/test?userId=${userId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: testTo || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j?.error || "Test failed");
      alert(`Test sent to ${j.to}. Check your inbox!`);
      setStatus({ provider: tab, verified: true });
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 grid gap-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">Connect Mailbox</h1>

      <div className="rounded-2xl border p-4">
        <div className="flex gap-2 mb-4">
          <button className={`px-3 py-1.5 rounded-xl ${tab === "gmail" ? "bg-black text-white" : "bg-gray-100"}`} onClick={() => setTab("gmail")}>
            Gmail OAuth
          </button>
          <button className={`px-3 py-1.5 rounded-xl ${tab === "outlook" ? "bg-black text-white" : "bg-gray-100"}`} onClick={() => setTab("outlook")}>
            Outlook OAuth
          </button>
          <button className={`px-3 py-1.5 rounded-xl ${tab === "smtp" ? "bg-black text-white" : "bg-gray-100"}`} onClick={() => setTab("smtp")}>
            SMTP
          </button>
        </div>

        {tab === "gmail" && (
          <div className="grid gap-3">
            <p className="text-sm text-gray-600">Connect with Google to send via Gmail using OAuth (safer than passwords).</p>
            <button onClick={connectGmail} className="rounded-xl bg-red-600 text-white px-4 py-2 w-fit">
              Connect Google
            </button>
          </div>
        )}

        {tab === "outlook" && (
          <div className="grid gap-3">
            <p className="text-sm text-gray-600">Connect with Microsoft to send via Outlook using OAuth.</p>
            <button onClick={connectOutlook} className="rounded-xl bg-blue-600 text-white px-4 py-2 w-fit">
              Connect Outlook
            </button>
          </div>
        )}

        {tab === "smtp" && (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="From Email">
                <input className="border rounded-xl px-3 py-2 w-full" value={smtp.from_email} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} />
              </Field>
              <Field label="From Name (optional)">
                <input className="border rounded-xl px-3 py-2 w-full" value={smtp.from_name} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} />
              </Field>
              <Field label="SMTP Host">
                <input className="border rounded-xl px-3 py-2 w-full" value={smtp.smtp_host} onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })} />
              </Field>
              <Field label="SMTP Port">
                <input type="number" className="border rounded-xl px-3 py-2 w-full" value={smtp.smtp_port} onChange={(e) => setSmtp({ ...smtp, smtp_port: Number(e.target.value) })} />
              </Field>
              <Field label="Secure (SSL/TLS)">
                <input type="checkbox" checked={smtp.smtp_secure} onChange={(e) => setSmtp({ ...smtp, smtp_secure: e.target.checked })} />
              </Field>
              <div />
              <Field label="SMTP Username">
                <input className="border rounded-xl px-3 py-2 w-full" value={smtp.smtp_user} onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })} />
              </Field>
              <Field label="SMTP Password / App Password">
                <input type="password" className="border rounded-xl px-3 py-2 w-full" value={smtp.smtp_pass} onChange={(e) => setSmtp({ ...smtp, smtp_pass: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2">
              <button onClick={saveSMTP} disabled={busy} className="rounded-xl bg-black text-white px-4 py-2">
                Save SMTP
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border p-4">
        <h2 className="font-medium mb-2">Send Test Email</h2>
        <p className="text-sm text-gray-600">Send a test from your connected mailbox. If empty, we’ll send it to your “From” address.</p>
        <div className="mt-2 flex gap-2">
          <input placeholder="optional: you@yourdomain.com" className="border rounded-xl px-3 py-2 flex-1" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button onClick={sendTest} disabled={busy || !userId} className="rounded-xl bg-blue-600 text-white px-4 py-2">
            Send Test
          </button>
        </div>
      </div>

      {status?.verified && (
        <div className="rounded-2xl border p-4 bg-green-50 text-green-800">✅ Mailbox verified. You’re ready to send campaigns.</div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

