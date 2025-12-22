"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SenderSettingsPage() {
  const [userId, setUserId] = useState("");
  const [schedulingUrl, setSchedulingUrl] = useState("https://calendly.com/yourname/demo");
  const [nudgeDelay, setNudgeDelay] = useState(24);
  const [maxNudges, setMaxNudges] = useState(1);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/settings/sender/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          scheduling_url: schedulingUrl,
          nudge_delay_hours: Number(nudgeDelay),
          max_nudges_per_lead: Number(maxNudges),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "save failed");
      setNotice("Saved!");
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function runNudge() {
    if (!userId) return;
    const res = await fetch("/api/worker/interest-nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, take: 50 }),
    });
    const j = await res.json();
    alert(JSON.stringify(j, null, 2));
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Sender Settings</h1>

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex gap-2">
          <Input placeholder="user_id (dev)" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <Input placeholder="Calendly / scheduling URL" value={schedulingUrl} onChange={(e) => setSchedulingUrl(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input type="number" placeholder="Nudge delay (hours)" value={nudgeDelay} onChange={(e) => setNudgeDelay(Number(e.target.value))} />
          <Input type="number" placeholder="Max nudges per lead" value={maxNudges} onChange={(e) => setMaxNudges(Number(e.target.value))} />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving || !userId}>{saving ? "Saving..." : "Save Settings"}</Button>
          <Button variant="secondary" onClick={runNudge} disabled={!userId}>Run Nudge Now</Button>
        </div>
        {notice && <div className="text-sm text-muted-foreground">{notice}</div>}
      </div>

      <p className="text-xs text-muted-foreground">
        The nudge worker finds replies marked <code>Interested</code> with no booked meeting after your delay, then sends one friendly reminder with your link.
      </p>
    </div>
  );
}
