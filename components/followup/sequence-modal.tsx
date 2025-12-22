"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FollowUpStep = {
  subject: string;
  body: string;
};

type Props = {
  steps: FollowUpStep[];
  open: boolean;
  onClose: () => void;
};

export function FollowUpSequenceModal({ steps, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="space-y-6 max-h-[90vh] overflow-y-auto max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-bold text-xl">AI Follow-Up Sequence</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {steps.map((step, i) => (
            <Card key={i} className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm">Step {i + 1}</h4>
                <span className="text-xs text-muted-foreground">
                  {i === 0
                    ? "Light bump"
                    : i === 1
                    ? "Value drop"
                    : i === 2
                    ? "Case study"
                    : i === 3
                    ? "Direct ask"
                    : "Break-up email"}
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-sm">
                  <b>Subject:</b> <span className="font-medium">{step.subject}</span>
                </p>
                <pre className="text-sm whitespace-pre-wrap text-muted-foreground bg-muted/40 p-3 rounded-md">
                  {step.body}
                </pre>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}










