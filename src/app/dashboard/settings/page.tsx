"use client";
import { useEffect, useState } from "react";
import ExtensionHealthCard from "@/components/ExtensionHealthCard";
import ReferralCard from "@/components/ReferralCard";
import HubspotCard from "@/components/HubspotCard";
import SlackCard from "@/components/SlackCard";
import DomainNudge from "@/components/DomainNudge";
import EmailConnect from "@/app/settings/EmailConnect";
import { SendingAccounts } from "@/components/SendingAccounts";
import { OptOutGuard } from "@/components/settings/OptOutGuard";
import { ComplianceGuard } from "@/components/settings/ComplianceGuard";
import { OooDeferral } from "@/components/settings/OooDeferral";
import { createClientComponentClient } from "@/lib/supabase";

export default function SettingsPage() {
  const supabase = createClientComponentClient();
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState<null | { email: string }>(null);

  useEffect(() => {
    fetch("/api/settings/learn-status").then(r=>r.json()).then(j=>setOn(!!j.enabled)).catch(()=>{});
    
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check gmail_connections table (single-tenant MVP uses OWNER_USER_ID)
      // For MVP, we fetch using service role via API since user might not be OWNER_USER_ID
      const connRes = await fetch("/api/auth/gmail/status");
      if (connRes.ok) {
        const connData = await connRes.json();
        if (connData?.email_address) setConnected({ email: connData.email_address });
      }
    })();
  }, [supabase]);

  async function save(v: boolean) {
    setSaving(true);
    await fetch("/api/settings/learn-status", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ enabled: v })
    });
    setOn(v); setSaving(false);
  }

  // Check URL params for connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailConnected = params.get("gmail_connected");
    const gmailError = params.get("gmail_error");
    
    if (gmailConnected === "1") {
      // Refresh connection status
      (async () => {
        const connRes = await fetch("/api/auth/gmail/status");
        if (connRes.ok) {
          const connData = await connRes.json();
          if (connData?.email_address) setConnected({ email: connData.email_address });
        }
      })();
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/settings");
    }
    
    if (gmailError) {
      alert(`Gmail connection error: ${decodeURIComponent(gmailError)}`);
      window.history.replaceState({}, "", "/dashboard/settings");
    }
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <DomainNudge />
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="border rounded p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Learn from my sent emails</div>
          <div className="text-sm text-gray-500">Personalize replies to match my writing style.</div>
        </div>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={on} onChange={e=>save(e.target.checked)} />
          <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-black transition-all relative after:content-[''] after:absolute after:w-5 after:h-5 after:bg-white after:rounded-full after:top-0.5 after:left-0.5 peer-checked:after:translate-x-5 after:transition"></div>
        </label>
      </div>
      {saving && <div className="text-sm text-gray-500">Saving…</div>}
      
      <div className="border rounded p-4 space-y-4">
        <div>
          <div className="font-medium">Chrome Extension</div>
          <div className="text-sm text-gray-500">Connect your SmartSendAI Chrome extension to use AI-powered replies in Gmail.</div>
        </div>
        <div className="flex gap-3">
          <a 
            href="/extension/link" 
            className="px-3 py-2 rounded bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Connect Extension
          </a>
          <button 
            onClick={async () => {
              if (confirm('This will disconnect your extension. Continue?')) {
                await fetch('/api/extension/revoke', { method: 'POST' });
                alert('Extension disconnected successfully.');
              }
            }}
            className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Disconnect Extension
          </button>
        </div>
      </div>
      
      <ExtensionHealthCard />
      
      <div className="rounded-2xl border border-neutral-800 p-5 bg-neutral-900">
        <h2 className="text-lg font-semibold mb-2">Gmail Connection</h2>
        {connected ? (
          <div className="flex items-center justify-between">
            <p className="text-sm opacity-80">
              Connected as <span className="font-medium">{connected.email}</span>
            </p>
            <a
              href="/api/auth/gmail/start"
              className="px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-white/5"
            >
              Re-connect
            </a>
          </div>
        ) : (
          <a
            href="/api/auth/gmail/start"
            className="inline-block px-4 py-2 rounded-xl bg-amber-400 text-black font-semibold hover:bg-amber-300 transition-colors"
          >
            Connect Gmail
          </a>
        )}
      </div>
      
      <div className="border rounded p-4 space-y-2">
        <h2 className="text-lg font-medium">Email Accounts</h2>
        <EmailConnect />
      </div>
      
      <div className="border rounded p-4 space-y-2">
        <h2 className="text-lg font-medium">Sending Accounts</h2>
        <SendingAccounts />
      </div>
      
      <ComplianceGuard />

      <OptOutGuard />
      
      <OooDeferral />
      
      <HubspotCard />
      
      <SlackCard />
      
      <ReferralCard />
    </div>
  );
} 