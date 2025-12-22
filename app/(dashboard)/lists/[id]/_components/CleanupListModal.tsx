"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";

type CleanupListModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listName: string;
  onSuccess: () => void;
};

export function CleanupListModal({
  open,
  onOpenChange,
  listId,
  listName,
  onSuccess,
}: CleanupListModalProps) {
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [removeSuppressed, setRemoveSuppressed] = useState(true);
  const [removeBounces, setRemoveBounces] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!removeDuplicates && !removeSuppressed && !removeBounces) {
      alert("Please select at least one cleanup option");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remove_duplicates: removeDuplicates,
          remove_suppressed: removeSuppressed,
          remove_bounces: removeBounces,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const totalRemoved =
          (json.duplicates_removed || 0) +
          (json.suppressed_removed || 0) +
          (json.bounces_removed || 0);

        alert(
          `List cleaned successfully!\n\n` +
            `Duplicates removed: ${json.duplicates_removed || 0}\n` +
            `Suppressed removed: ${json.suppressed_removed || 0}\n` +
            `Bounces removed: ${json.bounces_removed || 0}\n` +
            `Total removed: ${totalRemoved}`
        );
        onSuccess();
        onOpenChange(false);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to clean list");
      }
    } catch (error) {
      console.error("Error cleaning list:", error);
      alert("Failed to clean list");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Clean Up List
            </DialogTitle>
            <DialogDescription>
              Remove unwanted contacts from "{listName}" to improve deliverability
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="duplicates"
                  checked={removeDuplicates}
                  onCheckedChange={(checked) =>
                    setRemoveDuplicates(checked === true)
                  }
                />
                <Label htmlFor="duplicates" className="cursor-pointer">
                  Remove Duplicates
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Removes duplicate contacts (keeps first occurrence)
              </p>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="suppressed"
                  checked={removeSuppressed}
                  onCheckedChange={(checked) =>
                    setRemoveSuppressed(checked === true)
                  }
                />
                <Label htmlFor="suppressed" className="cursor-pointer">
                  Remove Suppressed Contacts
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Removes contacts who have unsubscribed
              </p>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bounces"
                  checked={removeBounces}
                  onCheckedChange={(checked) =>
                    setRemoveBounces(checked === true)
                  }
                />
                <Label htmlFor="bounces" className="cursor-pointer">
                  Remove Bounced Contacts
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Removes contacts with bounced emails (protects deliverability)
              </p>
            </div>

            <div className="p-4 bg-yellow-50 rounded-md">
              <p className="text-sm text-yellow-900">
                <strong>Note:</strong> This will only remove contacts from this list.
                The contacts themselves will not be deleted from your database.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Cleaning..." : "Clean Up List"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}





















































