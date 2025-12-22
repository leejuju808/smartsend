"use client";

import { useSearchParams } from "next/navigation";
import { BillingButton } from "./BillingButton";

export function HeaderBillingButton() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('ws') || '';

  if (!workspaceId) {
    return null;
  }

  return <BillingButton workspaceId={workspaceId} className="text-sm" />;
}