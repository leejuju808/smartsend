# Upgrade Wall Integration Example

This document shows how to integrate the upgrade wall system (Block 16700) into your pages and components.

## Basic Integration Pattern

```tsx
"use client";

import { useUpgradeGate } from "@/hooks/useUpgradeGate";
import { UpgradeModal } from "@/components/UpgradeModal";

export function MyComponent() {
  const { upgradeReason, requireUpgrade, close } = useUpgradeGate();

  async function createCampaign() {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ ... }),
    });

    if (res.status === 403) {
      const json = await res.json();
      if (json.error === "upgrade_required") {
        requireUpgrade(json.reason); // "campaign_limit" | "monthly_email_limit" | "feature_locked"
        return;
      }
    }

    // Handle success...
  }

  return (
    <>
      <button onClick={createCampaign}>Create Campaign</button>

      {upgradeReason && (
        <UpgradeModal feature={upgradeReason} onClose={close} />
      )}
    </>
  );
}
```

## Feature Lock Pattern

For features that require Growth or Domination plans:

```tsx
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { getFeatures } from "@/lib/billing/feature-gates";
import { useUpgradeGate } from "@/hooks/useUpgradeGate";

export function FeatureComponent() {
  const { workspace } = useCurrentWorkspace();
  const { upgradeReason, requireUpgrade, close } = useUpgradeGate();
  
  const features = workspace ? getFeatures(workspace.plan_key as any) : null;
  const isLocked = features && !features.autoFollowups; // or revenueDashboard, etc.

  if (isLocked) {
    return (
      <>
        <div className="border rounded-xl p-3 bg-slate-50">
          <div className="text-xs font-semibold mb-1">
            Auto Follow-ups (Growth & Domination)
          </div>
          <div className="text-[11px] text-gray-600 mb-2">
            This feature requires Growth or Domination plan.
          </div>
          <button
            onClick={() => requireUpgrade("feature_locked")}
            className="text-[11px] px-2 py-1 rounded-lg border bg-white"
          >
            Upgrade to unlock
          </button>
        </div>
        
        {upgradeReason && (
          <UpgradeModal feature={upgradeReason} onClose={close} />
        )}
      </>
    );
  }

  // Render actual feature...
}
```

## Dashboard Upgrade Wall Pattern

For locked dashboard sections:

```tsx
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { getFeatures } from "@/lib/billing/feature-gates";
import { useUpgradeGate } from "@/hooks/useUpgradeGate";
import { UpgradeModal } from "@/components/UpgradeModal";

export function DashboardPage() {
  const { workspace } = useCurrentWorkspace();
  const { upgradeReason, requireUpgrade, close } = useUpgradeGate();
  
  const features = workspace ? getFeatures(workspace.plan_key as any) : null;
  const isLocked = features && !features.revenueDashboard;

  return (
    <div className="space-y-6 p-6 relative">
      {isLocked && (
        <div className="absolute inset-0 backdrop-blur-lg bg-white/70 flex items-center justify-center z-10 rounded-lg">
          <div className="text-center space-y-3">
            <div className="text-lg font-bold">Revenue Dashboard</div>
            <div className="text-sm text-gray-600">
              Unlock with Domination Plan
            </div>
            <button
              onClick={() => requireUpgrade("feature_locked")}
              className="text-xs px-3 py-2 rounded-xl bg-black text-white"
            >
              Upgrade to Domination
            </button>
          </div>
        </div>
      )}
      
      {/* Dashboard content */}
      
      {upgradeReason && (
        <UpgradeModal feature={upgradeReason} onClose={close} />
      )}
    </div>
  );
}
```

## API Error Handling

The API endpoints return upgrade_required errors in this format:

```json
{
  "error": "upgrade_required",
  "reason": "campaign_limit" | "monthly_email_limit" | "feature_locked",
  "message": "Human-readable message",
  "plan": "Starter",
  "activeCount": 1,
  "maxCampaigns": 1
}
```

Status code: `403` (Forbidden)

## Upgrade Reasons

- `campaign_limit`: User hit campaign creation limit
- `monthly_email_limit`: User hit monthly email sending quota
- `feature_locked`: Feature requires higher plan (Growth or Domination)



























































