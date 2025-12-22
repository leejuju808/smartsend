"use client";

import * as React from "react";
import { Share2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MemberRow {
  id: string;
  role: "owner" | "editor" | "viewer";
  user_id: string;
  email: string;
  name: string | null;
  created_at: string;
}

interface CampaignSharePanelProps {
  campaignId: string;
  members: MemberRow[];
}

export function CampaignSharePanel({
  campaignId,
  members,
}: CampaignSharePanelProps) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"owner" | "editor" | "viewer">("editor");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [localMembers, setLocalMembers] = React.useState<MemberRow[]>(members);

  React.useEffect(() => {
    setLocalMembers(members);
  }, [members]);

  const handleShare = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Enter an email.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/campaigns/${campaignId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Failed to share campaign.");
        return;
      }

      // optimistic: push a placeholder member row
      setLocalMembers((prev) => [
        {
          id: json.campaign_id + "-" + email, // temp
          role,
          user_id: json.user_id ?? "",
          email: email.trim(),
          name: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setEmail("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
        onClick={() => setOpen(true)}
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="flex flex-row items-center justify-between px-6 py-4 border-b">
            <SheetTitle className="text-base font-semibold">
              Share campaign
            </SheetTitle>
            <button
              className="rounded-full p-1 hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </SheetHeader>

          <div className="flex-1 p-6 space-y-4 overflow-auto">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Invite teammates to collaborate on this campaign. Owners control
                access, editors can modify, and viewers can only see data.
              </p>
            </div>

            {/* Invite form */}
            <div className="space-y-2 rounded-2xl border bg-card p-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Teammate email
                </label>
                <Input
                  type="email"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Role
                </label>
                <Select
                  value={role}
                  onValueChange={(v) =>
                    setRole(v as "owner" | "editor" | "viewer")
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner (full control)</SelectItem>
                    <SelectItem value="editor">
                      Editor (edit campaign)
                    </SelectItem>
                    <SelectItem value="viewer">
                      Viewer (read-only)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleShare}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  {isSubmitting ? "Sharing…" : "Invite"}
                </Button>
              </div>
            </div>

            {/* Member list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Members
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {localMembers.length} total
                </span>
              </div>
              {localMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  Only you currently have access to this campaign.
                </p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                  {localMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {m.name || "Unknown user"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {m.email}
                        </span>
                      </div>
                      <Badge
                        variant={
                          m.role === "owner"
                            ? "default"
                            : m.role === "editor"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {m.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}































































