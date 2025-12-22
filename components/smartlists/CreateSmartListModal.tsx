"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CreateSmartListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateSmartListModal({ open, onOpenChange, onCreated }: CreateSmartListModalProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a SmartList name");
      return;
    }

    if (!prompt.trim()) {
      toast.error("Please describe what kind of leads you want");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/smartlists/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create SmartList");
      }

      toast.success("SmartList created successfully");
      setName("");
      setPrompt("");
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to create SmartList");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create AI SmartList</DialogTitle>
          <DialogDescription>
            Create an AI-powered dynamic segment that automatically updates every 24 hours based on lead behavior, engagement, and intent signals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="smartlist-name" className="text-sm font-medium">
              SmartList Name
            </label>
            <Input
              id="smartlist-name"
              placeholder="e.g., High-Intent Construction Leads"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="smartlist-prompt" className="text-sm font-medium">
              Describe what kind of leads you want
            </label>
            <Textarea
              id="smartlist-prompt"
              placeholder="e.g., Find high-intent leads for construction companies that have engaged with our emails and use relevant tech tools..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              The AI will analyze lead behavior, company intent, replies, tech stack, engagement, and more to automatically generate and optimize segment rules.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create SmartList"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}












