"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function PreviewPanel({ presetId }: { presetId: string }) {
  const [leadId, setLeadId] = React.useState("");
  const [leads, setLeads] = React.useState<Array<{ id: string; first_name: string | null; company: string | null }>>([]);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const r = await fetch("/api/leads/min");
      if (r.ok) {
        setLeads(await r.json());
      }
    })();
  }, []);

  async function run() {
    if (!leadId) return;
    setLoading(true);
    const r = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset_id: presetId, lead_id: leadId }),
    });
    setLoading(false);
    if (!r.ok) {
      setSubject("");
      setBody("Failed");
      return;
    }
    const d = await r.json();
    setSubject(d.subject ?? "");
    setBody(d.body ?? "");
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Select onValueChange={setLeadId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a lead for preview" />
            </SelectTrigger>
            <SelectContent>
              {leads.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {(l.first_name ?? "Lead")} · {(l.company ?? "—")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={run} disabled={!leadId || loading}>
            {loading ? "Rewriting…" : "Preview with Lead"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <input
          className="w-full rounded-xl border p-2"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
        />
        <Textarea
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Body"
        />
      </div>
    </div>
  );
}








