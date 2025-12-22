"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FollowUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variants: string[];
  onApply: (variant: string) => void;
}

export function FollowUpModal({
  open,
  onOpenChange,
  variants,
  onApply,
}: FollowUpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            AI Follow-Up Suggestions
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {variants.map((variant, index) => {
            const labels = ["A — Soft Friendly", "B — Direct", "C — Ultra Concise"];
            return (
              <Card key={index} className="p-4">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      {labels[index] || `Variant ${index + 1}`}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {variant}
                  </p>
                  <Button
                    onClick={() => {
                      onApply(variant);
                      onOpenChange(false);
                    }}
                    className="w-full mt-2"
                    variant="outline"
                  >
                    Use This
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}










