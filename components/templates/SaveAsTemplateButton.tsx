"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LayoutTemplate, Loader2 } from "lucide-react";

type Props = {
  subject: string;
  body: string;
};

export function SaveAsTemplateButton({ subject, body }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }

    if (!subject && !body) {
      setError("Nothing to save. Add a subject or body.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subject,
          body,
          visibility,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        console.error("save template error", json);
        setError(json.error || "Failed to save template");
        return;
      }

      setOpen(false);
      setName("");
    } catch (err) {
      console.error("save template exception", err);
      setError("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
        >
          <LayoutTemplate className="h-3 w-3 mr-1" />
          Save as template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Save as template
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Store this subject and body as a reusable template in your
              workspace library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Template name</Label>
              <Input
                className="h-8 text-[12px]"
                placeholder="e.g. First touch – SaaS founders"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs">Share with workspace</Label>
                <p className="text-[10px] text-muted-foreground">
                  When on, your teammates can see and use this template.
                </p>
              </div>
              <Switch
                checked={visibility === "team"}
                onCheckedChange={(v) =>
                  setVisibility(v ? "team" : "private")
                }
              />
            </div>
            {error && (
              <p className="text-[10px] text-red-300">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              className="h-8 px-3 text-[11px]"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

