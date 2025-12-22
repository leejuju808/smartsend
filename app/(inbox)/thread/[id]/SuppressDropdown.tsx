"use client";

import * as React from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SuppressDropdownProps = {
  email: string;
  accountId?: string | null;
  campaignId?: string | null;
  onSuppressed?: () => void;
};

type Scope = "global" | "account" | "campaign";
type Kind = "email" | "domain" | "role";

export function SuppressDropdown({ email, accountId, campaignId, onSuppressed }: SuppressDropdownProps) {
  const supabase = React.useMemo(() => createClientComponentClient(), []);

  const normalizedEmail = React.useMemo(
    () => email?.trim().toLowerCase() ?? "",
    [email]
  );
  const domain = React.useMemo(() => {
    if (!normalizedEmail.includes("@")) return "";
    return normalizedEmail.split("@")[1] ?? "";
  }, [normalizedEmail]);
  const localpart = React.useMemo(() => {
    if (!normalizedEmail.includes("@")) return "";
    return normalizedEmail.split("@")[0] ?? "";
  }, [normalizedEmail]);

  const computeDefaultScope = React.useCallback((): Scope => {
    if (campaignId) return "campaign";
    if (accountId) return "account";
    return "global";
  }, [accountId, campaignId]);

  const [loading, setLoading] = React.useState(true);
  const [suppressed, setSuppressed] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [scope, setScope] = React.useState<Scope>(computeDefaultScope);
  const [kind, setKind] = React.useState<Kind>("email");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("manual");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const refreshStatus = React.useCallback(async () => {
    if (!normalizedEmail) {
      setSuppressed(false);
      setLoading(false);
      return false;
    }
    setChecking(true);
    const { data, error } = await supabase.rpc("is_suppressed", {
      p_email: normalizedEmail,
      p_account: accountId ?? null,
      p_campaign: campaignId ?? null,
    });
    if (error) {
      console.error("is_suppressed rpc failed", error);
      toast.error("Failed to check suppression status");
      setSuppressed(false);
    } else {
      setSuppressed(!!data);
    }
    setLoading(false);
    setChecking(false);
    return !!data;
  }, [accountId, campaignId, normalizedEmail, supabase]);

  React.useEffect(() => {
    setScope(computeDefaultScope());
  }, [computeDefaultScope]);

  React.useEffect(() => {
    setKind("email");
    setValue(normalizedEmail);
    refreshStatus().catch(() => {
      /* handled in refreshStatus */
    });
  }, [normalizedEmail, refreshStatus]);

  const openDialogFor = React.useCallback(
    (nextKind: Kind) => {
      setKind(nextKind);
      if (nextKind === "email") setValue(normalizedEmail);
      else if (nextKind === "domain") setValue(domain);
      else setValue(localpart);
      setReason("manual");
      setNote("");
      setScope(computeDefaultScope());
      setDialogOpen(true);
    },
    [computeDefaultScope, domain, localpart, normalizedEmail]
  );

  const handleSubmit = React.useCallback(async () => {
    if (!value.trim()) {
      toast.error("Enter a value to suppress");
      return;
    }
    const payload: Record<string, unknown> = {
      scope,
      kind,
      values: [value.trim().toLowerCase()],
      reason: reason.trim() || "manual",
      note: note.trim() || null,
    };
    if (scope === "account" && accountId) {
      payload.account_id = accountId;
    } else if (scope === "campaign" && campaignId) {
      payload.campaign_id = campaignId;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/suppressions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to add suppression");
      }
      await refreshStatus();
      toast.success("Recipient suppressed");
      setDialogOpen(false);
      onSuppressed?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add suppression";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [accountId, campaignId, kind, note, onSuppressed, reason, refreshStatus, scope, value]);

  if (!normalizedEmail) {
    return null;
  }

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking…
      </Button>
    );
  }

  if (suppressed) {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <ShieldAlert className="h-3.5 w-3.5" />
        Suppressed
      </Badge>
    );
  }

  const disableAccount = !accountId;
  const disableCampaign = !campaignId;

  return (
    <>
      <Button variant="outline" size="sm" disabled={checking} onClick={() => openDialogFor("email")}>
        Suppress…
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppress recipient</DialogTitle>
            <DialogDescription>
              Choose scope and reason. Suppressed contacts are blocked from future sends.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="suppression-scope">
                Scope
              </label>
              <select
                id="suppression-scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as Scope)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="global">Global</option>
                <option value="account" disabled={disableAccount}>
                  Account {disableAccount ? "(unavailable)" : ""}
                </option>
                <option value="campaign" disabled={disableCampaign}>
                  Campaign {disableCampaign ? "(unavailable)" : ""}
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="suppression-kind">
                Kind
              </label>
              <select
                id="suppression-kind"
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as Kind;
                  setKind(next);
                  if (next === "email") setValue(normalizedEmail);
                  else if (next === "domain") setValue(domain);
                  else setValue(localpart);
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="email">Email</option>
                <option value="domain">Domain</option>
                <option value="role">Role (localpart)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="suppression-value">
                Value
              </label>
              <Input
                id="suppression-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={kind === "domain" ? domain : kind === "role" ? localpart : normalizedEmail}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="suppression-reason">
                Reason
              </label>
              <Input
                id="suppression-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="manual"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="suppression-note">
                Note <span className="text-xs text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="suppression-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why are we suppressing this recipient?"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Suppress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

