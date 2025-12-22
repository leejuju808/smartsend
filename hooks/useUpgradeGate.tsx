"use client";

import { useState } from "react";
import type { UpgradeReason } from "@/components/UpgradeModal";

export function useUpgradeGate() {
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);

  function requireUpgrade(reason: UpgradeReason) {
    setUpgradeReason(reason);
  }

  function close() {
    setUpgradeReason(null);
  }

  return {
    upgradeReason,
    requireUpgrade,
    close,
  };
}
















