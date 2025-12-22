"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { campaignPreflight } from "@/actions/campaignPreflight";
import { startCampaign } from "@/actions/startCampaign";

export function CampaignReview({ 
  campaignId, 
  open, 
  onOpenChange 
}: { 
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  async function runCheck() {
    setLoading(true);
    setResult(null);
    try {
      const res = await campaignPreflight(campaignId);
      setResult(res);
    } catch (error) {
      setResult({
        ok: false,
        errors: ["Failed to run preflight check. Please try again."],
        warnings: [],
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleStartCampaign() {
    setStarting(true);
    try {
      await startCampaign(campaignId);
      onOpenChange(false);
      // Refresh the page to show updated status
      window.location.reload();
    } catch (error) {
      alert("Failed to start campaign. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Campaign Preflight Check</DialogTitle>
        </DialogHeader>
        {!result && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Run a safety check before launching your campaign to ensure everything is configured correctly.
            </p>
            <Button onClick={runCheck} disabled={loading} className="w-full">
              {loading ? "Running Check..." : "Run Preflight Check"}
            </Button>
          </div>
        )}
        {result && (
          <div className="space-y-4">
            {result.errors.length > 0 && (
              <div className="bg-red-100 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800">
                <h3 className="font-semibold text-red-700 dark:text-red-400 mb-2">Errors</h3>
                <ul className="list-disc ml-4 text-sm text-red-600 dark:text-red-300 space-y-1">
                  {result.errors.map((e: string, i: number) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="bg-yellow-100 dark:bg-yellow-900/20 p-3 rounded-md border border-yellow-200 dark:border-yellow-800">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-400 mb-2">Warnings</h3>
                <ul className="list-disc ml-4 text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  {result.warnings.map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.ok && (
              <div className="bg-green-100 dark:bg-green-900/20 p-3 rounded-md border border-green-200 dark:border-green-800">
                <p className="text-green-800 dark:text-green-300 font-semibold">
                  All good! This campaign is ready to launch.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  onOpenChange(false);
                }}
                className="flex-1"
              >
                Close
              </Button>
              {result?.ok && (
                <Button
                  onClick={handleStartCampaign}
                  disabled={starting}
                  className="flex-1"
                >
                  {starting ? "Starting..." : "Start Campaign"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}








