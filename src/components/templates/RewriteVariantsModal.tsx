"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

interface Variant {
  subject: string;
  body: string;
}

interface RewriteVariantsModalProps {
  variants: Variant[];
  onUseVariant: (variant: Variant, action: "replace" | "new_variant") => void;
  open: boolean;
  onClose: () => void;
}

export function RewriteVariantsModal({
  variants,
  onUseVariant,
  open,
  onClose,
}: RewriteVariantsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[80vh] overflow-y-auto space-y-4 max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose a Rewrite</DialogTitle>
          <DialogDescription>
            Pick one to replace the current template, or save as new variant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {variants.map((v, i) => (
            <Card key={i} className="p-4 space-y-2">
              {v.subject && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Subject:</p>
                  <p className="text-sm font-semibold">{v.subject}</p>
                </div>
              )}
              {v.body && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Body:</p>
                  <pre className="text-xs whitespace-pre-wrap bg-muted p-2 rounded-md max-h-48 overflow-y-auto">
                    {v.body}
                  </pre>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onUseVariant(v, "replace");
                    onClose();
                  }}
                >
                  Replace Template
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onUseVariant(v, "new_variant");
                    onClose();
                  }}
                >
                  Save as New Variant
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}









