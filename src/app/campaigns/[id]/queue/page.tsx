"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function CampaignQueuePage() {
  const params = useParams<{ id: string }>();
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [smtpAccounts, setSmtpAccounts] = React.useState<any[]>([]);
  const [smtpId, setSmtpId] = React.useState("");
  const [sequenceId, setSequenceId] = React.useState("");
  const [stepOrder, setStepOrder] = React.useState<number>(1);
  const [emailsRaw, setEmailsRaw] = React.useState("first@acme.com\noptout@example.com\nvalid@acme.com");
  const [scheduleAt, setScheduleAt] = React.useState<string>(""); // optional ISO local

  const recipients = React.useMemo(() => emailsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean), [emailsRaw]);

  async function loadSMTP() {
    if (!workspaceId) return;
    const res = await fetch(`/api/settings/smtp?workspaceId=${workspaceId}`);
    const json = await res.json();
    if (res.ok) setSmtpAccounts(json.items || []);
  }

  React.useEffect(() => { loadSMTP(); /* eslint-disable-next-line */ }, [workspaceId]);

  async function queue() {
    const res = await fetch("/api/send/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        campaignId: params.id,
        sequenceId,
        stepOrder,
        smtpAccountId: smtpId,
        emails: recipients,
        scheduleAtISO: scheduleAt ? new Date(scheduleAt).toISOString() : undefined
      })
    });
    const j = await res.json();
    if (!res.ok) alert(j.error || "Queue failed");
    else alert(`Queued: ${j.counts.inserted} (skipped invalid: ${j.counts.skipped_invalid}, suppressed: ${j.counts.skipped_suppressed})`);
  }

  async function runWorker() {
    const res = await fetch("/api/send/worker/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
    const j = await res.json();
    alert(JSON.stringify(j, null, 2));
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Queue Messages</h1>

      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm text-muted-foreground">Workspace ID</label>
            <Input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">SMTP Account</label>
            <Input list="smtp-list" value={smtpId} onChange={(e) => setSmtpId(e.target.value)} placeholder="paste smtp account id" />
            <datalist id="smtp-list">
              {smtpAccounts.map((a:any) => <option key={a.id} value={a.id}>{a.label} — {a.from_email}</option>)}
            </datalist>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Sequence ID</label>
            <Input value={sequenceId} onChange={(e) => setSequenceId(e.target.value)} placeholder="paste sequence id" />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Step Order</label>
            <Input type="number" value={stepOrder} onChange={(e) => setStepOrder(parseInt(e.target.value || "1"))} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Schedule at (optional)</label>
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-muted-foreground">Recipients (one per line)</label>
            <textarea className="w-full border rounded-2xl p-3 text-sm min-h-[140px]" value={emailsRaw} onChange={(e) => setEmailsRaw(e.target.value)} />
          </div>

          <div className="md:col-span-2 flex gap-3">
            <Button onClick={queue} disabled={!workspaceId || !smtpId || !sequenceId}>Queue</Button>
            <Button variant="outline" onClick={runWorker} disabled={!workspaceId}>Run Worker (test)</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}