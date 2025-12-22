"use client";

import { isDemoMode } from "@/lib/demo-mode";
import { isSalesModeEnabled } from "@/lib/feature-flags";

export function DemoBanner() {
  // BLOCK 281000 — Sales Mode: remove demo-only banners/toggles.
  if (isSalesModeEnabled()) return null;
  if (!isDemoMode()) return null;

  return (
    <div className="bg-amber-100 text-amber-800 text-center py-2 text-sm font-medium border-b border-amber-200">
      🚀 Demo Mode: Explore SmartSend's features (data is read-only)
    </div>
  );
}

