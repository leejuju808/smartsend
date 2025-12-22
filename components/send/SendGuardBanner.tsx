"use client";

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/Alert";
import { Button } from "@/src/components/ui/Button";
import { ShieldAlert } from "lucide-react";
import { FixListDialog } from "./FixListDialog";
import { UpgradeModal } from "@/components/billing/UpgradeModal";

type ValidateResp = {
  ok: boolean;
  counts: {
    total: number;
    invalid: number;
    duplicate_in_payload: number;
    suppressed_global: number;
    suppressed_campaign: number;
    final_sendable: number;
  };
  blocked: { email: string; reason: "invalid" | "suppressed_global" | "suppressed_campaign" | "duplicate_in_payload" }[];
  finalSendable: string[];
};

export function SendGuardBanner(props: {
  workspaceId: string;
  campaignId?: string | null;
  recipients: string[];
  onValidated: (data: ValidateResp) => void;
  onProceed: (finalRecipients: string[]) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<ValidateResp | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [excluded, setExcluded] = React.useState(false);
  const [plan, setPlan] = React.useState<"free"|"trialing"|"active"|"past_due"|"canceled">("free");

  async function fetchPlan() {
    const res = await fetch(`/api/profile/plan?workspaceId=${props.workspaceId}`);
    const json = await res.json();
    if (res.ok) setPlan(json.plan || "free");
  }

  async function validate() {
    setError(null);
    setLoading(true);
    setExcluded(false);
    try {
      const res = await fetch("/api/send/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId,
          campaignId: props.campaignId ?? null,
          recipients: props.recipients
        })
      });
      const json = (await res.json()) as ValidateResp;
      if (!res.ok) throw new Error((json as any).error || "Validation failed");
      setData(json);
      props.onValidated(json);
    } catch (e: any) {
      setError(e.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceId]);

  React.useEffect(() => {
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceId, props.campaignId, JSON.stringify(props.recipients)]);

  const hasBlocks =
    data &&
    (data.counts.invalid + data.counts.duplicate_in_payload + data.counts.suppressed_global + data.counts.suppressed_campaign) > 0;

  const autoFixAllowed = plan !== "free" && plan !== "canceled" && plan !== "past_due";
  const canSend = !!data && (!hasBlocks || (excluded && autoFixAllowed));

  return (
    <Alert>
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Send Safety Check</AlertTitle>
      <AlertDescription>
        {loading && <div className="text-sm">Validating recipients…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {data && (
          <div className="mt-2 text-sm space-y-1">
            <div>Total recipients: <strong>{data.counts.total}</strong></div>
            <div>Blocked — Invalid: <strong>{data.counts.invalid}</strong> · Duplicates: <strong>{data.counts.duplicate_in_payload}</strong></div>
            <div>Blocked — Global suppression: <strong>{data.counts.suppressed_global}</strong> · Campaign suppression: <strong>{data.counts.suppressed_campaign}</strong></div>
            <div>Final sendable (after fix): <strong>{data.counts.final_sendable}</strong></div>

            <div className="flex flex-wrap gap-3 pt-2 items-center">
              {hasBlocks && autoFixAllowed ? (
                <FixListDialog
                  blocked={data.blocked}
                  onExcludeAll={() => setExcluded(true)}
                  disabled={loading}
                />
              ) : hasBlocks ? (
                <UpgradeModal workspaceId={props.workspaceId}>
                  <Button variant="secondary">Fix list (Upgrade)</Button>
                </UpgradeModal>
              ) : null}

              <Button
                disabled={!canSend || loading}
                onClick={() => props.onProceed(data.finalSendable)}
              >
                {canSend ? "Send to final list" : autoFixAllowed ? "Resolve issues to send" : "Upgrade to auto-fix"}
              </Button>
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}