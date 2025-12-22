"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StepTemplate = {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  created_at: string;
};

interface StepLibraryProps {
  onInsertTemplate: (template: { subject: string | null; body: string }) => void;
  currentSubject?: string;
  currentBody?: string;
}

export function StepLibrary({ onInsertTemplate, currentSubject, currentBody }: StepLibraryProps) {
  const [open, setOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<StepTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/step-templates");
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim() || !currentBody) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/step-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          subject: currentSubject || null,
          body: currentBody,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save template");
      }

      setTemplateName("");
      setSaveDialogOpen(false);
      loadTemplates();
    } catch (error) {
      console.error("Failed to save template:", error);
      alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Insert from My Saved Steps
        </Button>
        {currentBody && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
          >
            Save Step as Template
          </Button>
        )}
      </div>

      {/* Insert Template Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Saved Steps</DialogTitle>
            <DialogDescription>
              Select a saved step template to insert into the editor
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No saved steps yet. Save a step to reuse it later.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{template.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Saved {new Date(template.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onInsertTemplate({
                          subject: template.subject,
                          body: template.body,
                        });
                        setOpen(false);
                      }}
                    >
                      Insert
                    </Button>
                  </div>
                  {template.subject && (
                    <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
                      <strong>Subject:</strong> {template.subject}
                    </div>
                  )}
                  <div className="mt-2 p-2 bg-muted/30 rounded text-xs font-mono max-h-32 overflow-y-auto">
                    {template.body.substring(0, 200)}
                    {template.body.length > 200 ? "..." : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Save Template Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Step as Template</DialogTitle>
            <DialogDescription>
              Give this step a name to save it for reuse
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Hail Damage Intro"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveTemplate} disabled={saving || !templateName.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}




























































