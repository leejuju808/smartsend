"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Stub profile settings to persist Calendly URL.
 * Wire the save() to your existing /api/profile PATCH endpoint in your project.
 */
export default function ProfileSettingsPage() {
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [calendlyUrl, setCalendlyUrl] = React.useState("");

  async function save() {
    // TODO: PATCH your /api/profile endpoint:
    // await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: workspaceId, calendly_url: calendlyUrl }) });
    alert("Stub: wire this to your /api/profile PATCH to persist calendly_url");
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Workspace ID</label>
            <Input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Calendly URL</label>
            <Input value={calendlyUrl} onChange={(e) => setCalendlyUrl(e.target.value)} placeholder="https://calendly.com/your-handle/15min" />
          </div>
          <Button onClick={save}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}