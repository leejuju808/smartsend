"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function ABLauncher({ campaignId, threadId }: { campaignId: string; threadId: string }) {
  const [name, setName] = React.useState("Subject vs Subject");
  const [subjectA, setSubjectA] = React.useState("");
  const [subjectB, setSubjectB] = React.useState("");
  const [bodyA, setBodyA] = React.useState("");
  const [bodyB, setBodyB] = React.useState("");
  const [mode, setMode] = React.useState<"subject" | "copy">("copy");
  const [busy, setBusy] = React.useState(false);

  async function launch() {
    setBusy(true);
    try {
      const r = await fetch(`/api/campaign/${campaignId}/ab`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          kind: mode,
          subject_a: mode === "subject" ? subjectA : undefined,
          body_a: mode === "copy" ? bodyA : undefined,
          subject_b: mode === "subject" ? subjectB : undefined,
          body_b: mode === "copy" ? bodyB : undefined,
          weight_a: 50,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error ?? "create test failed");
      }

      const rr = await fetch(`/api/thread/${threadId}/ab/${j.test_id}`, { method: "POST" });
      const jj = await rr.json().catch(() => ({}));
      if (!rr.ok) {
        throw new Error(jj?.error ?? "assign failed");
      }

      toast.success(`Draft created for variant ${jj.variant}`);
    } catch (e: any) {
      toast.error(e.message ?? "A/B failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-sm font-medium">A/B Test</div>
      <div className="mb-2 flex gap-2">
        <select
          className="rounded border bg-background p-2 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
        >
          <option value="copy">Copy (subject + body)</option>
          <option value="subject">Subject only</option>
        </select>
        <Input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name" />
      </div>

      {mode === "subject" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            value={subjectA}
            onChange={(e) => setSubjectA(e.target.value)}
            placeholder="Subject A (use {{first_name}}…)"
          />
          <Input value={subjectB} onChange={(e) => setSubjectB(e.target.value)} placeholder="Subject B" />
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          <Textarea
            value={bodyA}
            onChange={(e) => setBodyA(e.target.value)}
            placeholder="Variant A body (HTML/text allowed, tokens ok)"
          />
          <Textarea value={bodyB} onChange={(e) => setBodyB(e.target.value)} placeholder="Variant B body" />
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <Button onClick={launch} disabled={busy}>
          {busy ? "Launching…" : "Launch & Draft"}
        </Button>
      </div>
    </div>
  );
}

