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
import Link from "next/link";
import { toast } from "sonner";

export interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: "warmup" | "experiments" | "daily_sends" | "leads_count" | "seats" | string;
  message?: string;
  current?: number;
  limit?: number;
}

/**
 * Block 417: Upgrade Modal Component
 * Shows upgrade prompts when limits are reached or features are locked
 */
export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  message,
  current,
  limit,
}: UpgradeModalProps) {
  const getFeatureMessage = () => {
    if (message) return message;

    switch (feature) {
      case "warmup":
        return "Warmup is only available on Pro & Agency plans. Upgrade to protect your reach.";
      case "experiments":
        return "A/B testing requires Pro or Agency. Test subject lines and content to improve performance.";
      case "daily_sends":
        return `You've hit your daily contact limit of ${limit?.toLocaleString() || "500"}. Upgrade to contact more homeowners.`;
      case "leads_count":
        return `You've reached your lead limit of ${limit?.toLocaleString() || "5,000"}. Upgrade to store more leads.`;
      case "seats":
        return `You've reached your seat limit of ${limit || 1}. Upgrade to add more team members.`;
      default:
        return "Upgrade to unlock this feature and scale your job flow.";
    }
  };

  const getTitle = () => {
    if (feature === "daily_sends" || feature === "leads_count" || feature === "seats") {
      return "Limit Reached";
    }
    return "Upgrade Required";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{getTitle()}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {getFeatureMessage()}
          </DialogDescription>
        </DialogHeader>

        {(current !== undefined && limit !== undefined) && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <div className="text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Current usage:</span>
                <span className="font-semibold">{current.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-muted-foreground">Plan limit:</span>
                <span className="font-semibold">{limit.toLocaleString()}</span>
              </div>
              <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min((current / limit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Link href="/settings/billing" className="flex-1">
            <Button className="w-full">Upgrade Now</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
