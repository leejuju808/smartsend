"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default function SMTPSettingsPage() {
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [items, setItems] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({
    label: "Primary",
    host: "",
    port: 587,
    secure: false,
    username: "",
    secret: "",
    from_name: "SmartSend",
    from_email: "",
    rate_limit_per_minute: 60
  });
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    if (!workspaceId) return;
    const res = await fetch(`/api/settings/smtp?workspaceId=${workspaceId}`);
    const json = await res.json();
    if (res.ok) setItems(json.items || []);
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspaceId]);

  async function create() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/settings/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...form })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setForm({ ...form, secret: "" });
      await load();
      alert("SMTP account saved");
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this SMTP account?")) return;
    await fetch(`/api/settings/smtp/${id}?workspaceId=${workspaceId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">SMTP Settings</h1>

      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="text-sm text-muted-foreground">Workspace ID</label>
            <Input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Label</label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Host</label>
            <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Port</label>
            <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value || "587") })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Secure (TLS)</label>
            <Input value={String(form.secure)} onChange={(e) => setForm({ ...form, secure: e.target.value === "true" })} placeholder="true/false" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Username</label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Password/Secret</label>
            <Input type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">From Name</label>
            <Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">From Email</label>
            <Input value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Rate / minute</label>
            <Input type="number" value={form.rate_limit_per_minute} onChange={(e) => setForm({ ...form, rate_limit_per_minute: parseInt(e.target.value || "60") })} />
          </div>

          <div className="md:col-span-3 flex gap-3">
            <Button onClick={create} disabled={loading || !workspaceId}>{loading ? "Saving…" : "Save SMTP"}</Button>
            {err && <div className="text-sm text-red-600">{err}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 text-sm font-medium">Your SMTP accounts</div>
          <div className="border-t">
            <Table>
              <THead>
                <TR>
                  <TH>Label</TH><TH>From</TH><TH>Host</TH><TH>Rate/min</TH><TH>Added</TH><TH></TH>
                </TR>
              </THead>
              <TBody>
                {items.map((it) => (
                  <TR key={it.id}>
                    <TD>{it.label}</TD>
                    <TD>{it.from_name ? `${it.from_name} <${it.from_email}>` : it.from_email}</TD>
                    <TD>{it.host}:{it.port} {it.secure ? "(secure)" : ""}</TD>
                    <TD>{it.rate_limit_per_minute}</TD>
                    <TD>{new Date(it.created_at).toLocaleString()}</TD>
                    <TD><Button size="sm" variant="destructive" onClick={() => remove(it.id)}>Delete</Button></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}