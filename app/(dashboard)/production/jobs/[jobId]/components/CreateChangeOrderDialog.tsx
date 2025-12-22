"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload } from "lucide-react";

interface CreateChangeOrderDialogProps {
  jobId: string;
  onCreated?: () => void;
}

export function CreateChangeOrderDialog({
  jobId,
  onCreated,
}: CreateChangeOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [photos, setPhotos] = useState<Array<{ url: string; label?: string }>>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueText.trim()) {
      alert("Please describe the issue");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/change-orders/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          issue_text: issueText,
          photos: photos,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to create change order");
        return;
      }

      setOpen(false);
      setIssueText("");
      setPhotos([]);
      onCreated?.();
    } catch (error) {
      console.error("Error creating change order:", error);
      alert("Failed to create change order");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TODO: Upload photo to storage and get URL
    // For now, we'll use a placeholder
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setPhotos([...photos, { url, label: "issue" }]);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Change Order
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Change Order</DialogTitle>
          <DialogDescription>
            Describe the issue discovered during installation. AI will generate a professional change order description.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="issue">Issue Description</Label>
              <Textarea
                id="issue"
                placeholder="e.g., Discovered rotten decking that needs replacement..."
                value={issueText}
                onChange={(e) => setIssueText(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div>
              <Label htmlFor="photos">Photos (Optional)</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="photos"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="flex-1"
                />
              </div>
              {photos.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {photos.map((photo, idx) => (
                    <img
                      key={idx}
                      src={photo.url}
                      alt={`Photo ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded border"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Change Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
































