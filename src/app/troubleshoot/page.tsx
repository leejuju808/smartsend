"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import RecentSuppressions from "./components/RecentSuppressions";
import ContactsImporter from "@/components/ContactsImporter";
import SuppressionManager from "@/components/SuppressionManager";

type Health = { ok:boolean; checks:{ supabase:{ok:boolean,err?:string}, stripe:{ok:boolean,err?:string} } };
type Webhook = { last: { event_id:string, processed_at:string } | null };

export default function TroubleshootPage() {
  const [health, setHealth] = useState<Health|null>(null);
  const [webhook, setWebhook] = useState<Webhook|null>(null);
  const [testMail, setTestMail] = useState<"idle"|"ok"|"fail"|"loading">("idle");
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    (async () => {
      try {
        const h = await fetch("/api/health", { cache: "no-store" }).then(r=>r.json());
        setHealth(h);
      } catch {}
      try {
        const w = await fetch("/api/webhook/last", { cache: "no-store" }).then(r=>r.json());
        setWebhook(w);
      } catch {}
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
      } catch {}
    })();
  }, []);

  async function runMailTest() {
    try {
      setTestMail("loading");
      const res = await fetch("/api/mail/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId })
      }).then(r=>r.json());
      setTestMail(res.ok ? "ok" : "fail");
    } catch {
      setTestMail("fail");
    }
  }

  const Badge = ({ ok }: { ok:boolean }) => (
    <span className={`px-2 py-1 rounded-full text-xs ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {ok ? "Healthy" : "Issue"}
    </span>
  );

  return (
    <div className="p-6 grid gap-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">Troubleshoot</h1>

      {/* Health */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">System Health</h2>
          {health && <Badge ok={health.ok} />}
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Supabase</span>
            {health && <Badge ok={!!health.checks.supabase.ok} />}
          </div>
          <div className="flex items-center justify-between">
            <span>Stripe</span>
            {health && <Badge ok={!!health.checks.stripe.ok} />}
          </div>
          {!health?.ok && (
            <div className="mt-3 text-xs text-red-600">
              {health?.checks.supabase.err || health?.checks.stripe.err}
            </div>
          )}
        </div>
      </div>

      {/* Webhook */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Webhook Status</h2>
          <Badge ok={!!webhook?.last} />
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {webhook?.last
            ? <>Last event: <code>{webhook.last.event_id}</code> at {new Date(webhook.last.processed_at).toLocaleString()}</>
            : "No events recorded yet."}
        </div>
        <div className="mt-3 text-xs text-gray-500">
          If you don’t see recent events after a checkout, re-run your Stripe listener and confirm <code>STRIPE_WEBHOOK_SECRET</code> is live.
        </div>
      </div>

      {/* Mailbox test */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Mailbox Test</h2>
          <Badge ok={testMail === "ok"} />
        </div>
        <p className="mt-2 text-sm text-gray-600">Send a test email from your connected mailbox to verify credentials.</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={runMailTest}
            className="rounded-xl bg-black text-white px-4 py-2"
            disabled={testMail === "loading" || !userId}
          >
            {testMail === "loading" ? "Sending…" : "Send Test Email"}
          </button>
          {testMail === "fail" && <span className="text-sm text-red-600">Failed. Reconnect your mailbox in Settings.</span>}
          {testMail === "ok" && <span className="text-sm text-green-700">Delivered ✅</span>}
        </div>
        <div className="mt-4 text-xs text-gray-500">
          Tip: For Gmail, ensure OAuth tokens are valid or use an App Password for SMTP.
        </div>
      </div>

      {/* Recent Suppressions */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent Suppressions</h2>
        </div>
        {userId && <RecentSuppressions userId={userId} />}
      </div>

      <ContactsImporter />

      <SuppressionManager />
    </div>
  );
}