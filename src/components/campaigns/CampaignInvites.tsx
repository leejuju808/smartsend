"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export function CampaignInvites({ campaignId }: { campaignId: string }) {
  const { data, mutate } = useSWR(
    `/api/campaign-invites?campaign=${campaignId}`,
    (u) => fetch(u, { credentials: "include" }).then((r) => r.json()),
    { refreshInterval: 15000 }
  );
  const rows = data?.rows ?? [];
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [lastUrl, setLastUrl] = useState<string>("");

  const invite = async () => {
    if (!email.trim()) return;

    const res = await fetch("/api/campaign-invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ campaign_id: campaignId, email, role }),
    });

    const j = await res.json();
    if (res.ok) {
      setLastUrl(j.url);
      setEmail("");
      setRole("viewer");
      mutate();
      try {
        await navigator.clipboard.writeText(j.url);
      } catch {}
    } else {
      alert(j.error || "Failed to create invite");
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="font-medium">Invite teammates</div>

      <div className="grid sm:grid-cols-[1fr_160px_120px] gap-2">
        <Input
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              invite();
            }
          }}
        />
        <Select value={role} onValueChange={(v: any) => setRole(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={invite} disabled={!email.trim()}>
          Generate Link
        </Button>
      </div>

      {lastUrl && (
        <div className="text-xs rounded border p-2 bg-muted/50">
          Invite link created:{" "}
          <a className="underline text-blue-600" href={lastUrl} target="_blank" rel="noopener noreferrer">
            {lastUrl}
          </a>
          <span className="ml-2 text-muted-foreground">(copied to clipboard)</span>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Expires</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r: any) => (
              <TR key={r.id}>
                <TD className="text-xs">{r.email}</TD>
                <TD className="text-xs capitalize">{r.role}</TD>
                <TD className="text-xs">
                  {new Date(r.expires_at).toLocaleString()}
                </TD>
                <TD className="text-xs">
                  {r.accepted_at
                    ? `Accepted (${r.accepted_user_id?.slice(0, 8)}…)`
                    : "Pending"}
                </TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR>
                <TD colSpan={4} className="text-sm text-muted-foreground text-center">
                  No invites yet.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

