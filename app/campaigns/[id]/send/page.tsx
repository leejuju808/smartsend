"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Textarea } from "@/src/components/ui/Textarea";
import { SendGuardBanner } from "@/components/send/SendGuardBanner";

/**
 * NOTE: In your production flow, you'll likely derive recipients from sequences/segments.
 * For this slice, we provide a simple textarea (one email per line) to demonstrate the blocking guard.
 */

export default function CampaignSendPage() {
  const params = useParams<{ id: string }>();
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [rawList, setRawList] = React.useState("valid@example.com\noptout@example.com\nbad-email\ninfo@acme.com\nvalid2@example.com");

  const recipients = React.useMemo(
    () => rawList.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    [rawList]
  );

  const [validated, setValidated] = React.useState<any>(null);

  async function onProceed(finalRecipients: string[]) {
    // Persist a metrics row (optional but recommended)
    const blockedSuppressed =
      (validated?.counts?.suppressed_global ?? 0) + (validated?.counts?.suppressed_campaign ?? 0);
    const blockedInvalid =
      (validated?.counts?.invalid ?? 0) + (validated?.counts?.duplicate_in_payload ?? 0);

    await fetch("/api/send/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        campaignId: params.id,
        attempted_total: recipients.length,
        blocked_suppressed: blockedSuppressed,
        blocked_invalid: blockedInvalid,
        final_sendable: finalRecipients.length,
        metadata: { ui: "send_page" }
      })
    });

    // TODO: kick off your real send job with finalRecipients
    alert(`Sending to ${finalRecipients.length} recipients.\n\n(Real send job goes here)`);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Send Campaign</h1>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Workspace ID (UUID)</label>
            <Input
              placeholder="00000000-0000-0000-0000-000000000000"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Recipients (one email per line)</label>
            <Textarea rows={8} value={rawList} onChange={(e) => setRawList(e.target.value)} />
          </div>

          {workspaceId && recipients.length > 0 && (
            <SendGuardBanner
              workspaceId={workspaceId}
              campaignId={params.id}
              recipients={recipients}
              onValidated={setValidated}
              onProceed={onProceed}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}