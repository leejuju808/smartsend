"use client";
import { useEffect, useState } from "react";
import ExtensionHealthCard from "@/components/ExtensionHealthCard";
import ReferralCard from "@/components/ReferralCard";
import HubspotCard from "@/components/HubspotCard";
import SlackCard from "@/components/SlackCard";
import DomainNudge from "@/components/DomainNudge";

export default function SettingsPage() {
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/learn-status").then(r=>r.json()).then(j=>setOn(!!j.enabled)).catch(()=>{});
  }, []);

  async function save(v: boolean) {
    setSaving(true);
    await fetch("/api/settings/learn-status", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ enabled: v })
    });
    setOn(v); setSaving(false);
  }

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
      
      <HubspotCard />
      
      <SlackCard />
      
      <ReferralCard />
    </div>
  );
} 