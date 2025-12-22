"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type InviteModalProps = {
  campaignId: string;
  disabled?: boolean;
};

type InviteResult = {
  id: string;
  token?: string;
};

const ACCEPT_PATH = "/accept?token=";

export function InviteModal({ campaignId, disabled = false }: InviteModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  const acceptLink = useMemo(() => {
    if (!result?.token) return null;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    try {
      const origin = base || window?.location?.origin || "";
      return `${origin}${ACCEPT_PATH}${encodeURIComponent(result.token)}`;
    } catch {
      return `${ACCEPT_PATH}${encodeURIComponent(result.token)}`;
    }
  }, [result]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/campaigns/${campaignId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const message =
          (parsed && typeof parsed === "object" && parsed && "error" in parsed && typeof (parsed as any).error === "string"
            ? (parsed as any).error
            : text) || "Invite failed";
        throw new Error(message);
      }

      let token: string | undefined;
      let id: string | undefined;
      if (parsed && typeof parsed === "object" && parsed !== null) {
        if ("token" in parsed && typeof (parsed as any).token === "string") {
          token = (parsed as any).token;
        }
        if ("id" in parsed && typeof (parsed as any).id === "string") {
          id = (parsed as any).id;
        }
      } else if (typeof parsed === "string") {
        id = parsed;
      } else if (typeof text === "string") {
        const trimmed = text.trim().replace(/"/g, "");
        if (trimmed.length === 36) {
          id = trimmed;
        }
      }

      if (!id) throw new Error("Invite created but ID was missing");
      setResult({ id, token });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  function resetAndClose() {
    setOpen(false);
    setTimeout(() => {
      setEmail("");
      setRole("viewer");
      setLoading(false);
      setError(null);
      setResult(null);
    }, 150);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!disabled ? setOpen(next) : null)}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite teammate</DialogTitle>
          <DialogDescription>Send an invite email or generate a shareable link for testing.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "editor" | "viewer")}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {result?.token ? (
            <div className="rounded-md border px-3 py-3 text-sm space-y-2">
              <div className="font-medium text-sm">Invite link (dev/testing)</div>
              <div className="flex flex-col gap-2">
                <Input readOnly value={acceptLink ?? result.token} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(acceptLink ?? result.token)}
                >
                  Copy
                </Button>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-col sm:flex-row sm:justify-between sm:space-x-3">
            <Button type="button" variant="ghost" onClick={resetAndClose} className="sm:order-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !email} className={cn("sm:order-2", loading && "opacity-80")}>
              {loading ? "Sending…" : "Send Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

