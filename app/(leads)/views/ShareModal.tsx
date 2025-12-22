"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ShareModalProps = {
  viewId: string;
};

export function ShareModal({ viewId }: ShareModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success">("idle");

  async function share() {
    if (!email) return;
    setBusy(true);
    setError(null);
    setStatus("idle");

    try {
      const res = await fetch(`/api/saved-views/${viewId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Something went wrong");
        return;
      }

      setStatus("success");
      setEmail("");
      setTimeout(() => setOpen(false), 500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) {
        setEmail("");
        setError(null);
        setStatus("idle");
      }
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share view</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="teammate@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-70 w-16">Role</span>
            <Select value={role} onValueChange={(value: "viewer" | "editor") => setRole(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {status === "success" ? (
            <p className="text-sm text-muted-foreground">Invite sent!</p>
          ) : null}
          <Button onClick={share} disabled={!email || busy}>
            {busy ? "Sending..." : "Send invite"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

