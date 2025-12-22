"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function BillingGuardModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: "seat_limit" | "no_credits" | null;
  onClose: () => void;
}) {
  if (!open) return null;

  const getMessage = () => {
    if (reason === "seat_limit") {
      return "Your workspace has exceeded the seat limit. Please upgrade your plan or remove team members to continue sending.";
    }
    if (reason === "no_credits") {
      return "You are out of credits. Please purchase more credits to continue sending emails.";
    }
    return "Sending is currently blocked. Please check your billing settings.";
  };

  const getTitle = () => {
    if (reason === "seat_limit") {
      return "Seat Limit Exceeded";
    }
    if (reason === "no_credits") {
      return "Out of Credits";
    }
    return "Sending Blocked";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{getTitle()}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {getMessage()}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-4">
          {reason === "no_credits" && (
            <Button
              className="w-full"
              onClick={() => {
                window.location.href = "/billing/topup";
                onClose();
              }}
            >
              Purchase Credits
            </Button>
          )}
          {(reason === "seat_limit" || !reason) && (
            <Button
              className="w-full"
              onClick={() => {
                window.location.href = "/billing";
                onClose();
              }}
            >
              View Billing
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}








