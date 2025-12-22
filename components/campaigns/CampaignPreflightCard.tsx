"use client";

import { usePreflightCheck } from "@/lib/hooks/usePreflightCheck";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Check, XCircle, AlertTriangle, RefreshCw } from "lucide-react";

export function CampaignPreflightCard({ campaignId }: { campaignId: string }) {
  const { errors, warnings, matched, loading, ok, refresh } =
    usePreflightCheck(campaignId);

  return (
    <Card className="p-4 border rounded-md space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">Preflight Check</div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-xs text-muted-foreground hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {loading && (
        <div className="text-xs text-muted-foreground">Checking…</div>
      )}

      {!loading && (
        <>
          <div className="flex justify-between text-xs">
            <span>Audience</span>
            <Badge>{matched} leads</Badge>
          </div>

          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((e, idx) => (
                <div key={idx} className="flex items-start gap-2 text-red-600">
                  <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="text-xs">{e}</span>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1">
              {warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-yellow-600"
                >
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="text-xs">{w}</span>
                </div>
              ))}
            </div>
          )}

          {errors.length === 0 && warnings.length === 0 && (
            <div className="flex items-center gap-2 text-green-600 text-xs">
              <Check size={15} />
              All checks passed. Ready to launch.
            </div>
          )}
        </>
      )}
    </Card>
  );
}












