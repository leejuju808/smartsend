// components/settings/EmailSenderForm.tsx
// Block 8160 — Connect Email Sender form (dev stub)

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { Loader2, MailPlus } from "lucide-react";

export function EmailSenderForm({ onCreated }: { onCreated?: () => void }) {
  const { push } = useToast();
  const [provider, setProvider] = React.useState<string>("gmail");
  const [fromEmail, setFromEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!fromEmail) {
      push({
        title: "From email required",
        description: "Enter the email address that will send your campaigns.",
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/smartsend/outbound-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          fromEmail,
          displayName,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        push({
          title: "Failed to connect sender",
          description:
            data?.error ??
            "Something went wrong while creating the outbound account.",
          type: "error",
        });
        return;
      }

      push({
        title: "Sender connected",
        description: `Your ${provider.toUpperCase()} sender is ready to use.`,
        type: "success",
      });

      setFromEmail("");
      setDisplayName("");
      if (onCreated) onCreated();
    } catch (error) {
      console.error("EmailSenderForm error:", error);
      push({
        title: "Unexpected error",
        description: "Could not create outbound account.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border bg-card px-4 py-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Connect Email Sender
          </h2>
          <p className="text-xs text-muted-foreground">
            Choose a provider and the from-address your campaigns will use.
          </p>
        </div>
        <MailPlus className="h-4 w-4 opacity-70" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium">Provider</label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmail">Gmail</SelectItem>
              <SelectItem value="outlook">Outlook</SelectItem>
              <SelectItem value="smtp">Custom SMTP</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            OAuth flows will plug in here later.
          </p>
        </div>

        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-medium">From email</label>
          <Input
            type="email"
            placeholder="you@company.com"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1 md:col-span-1">
          <label className="text-xs font-medium">Display name (optional)</label>
          <Input
            placeholder="Your Name / Brand"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>Connect Sender</>
          )}
        </Button>
      </div>
    </form>
  );
}

































































