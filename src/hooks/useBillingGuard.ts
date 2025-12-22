"use client";

import { useState } from "react";

export function useBillingGuard() {
  const [modal, setModal] = useState<{
    open: boolean;
    reason: string | null;
  }>({
    open: false,
    reason: null,
  });

  async function guardedSend(fn: () => Promise<Response>) {
    const res = await fn();

    if (res.status === 429) {
      const data = await res.json();
      if (data.type === "billing_overage") {
        setModal({ open: true, reason: data.error });
      }
    }

    return res;
  }

  return {
    modal,
    setModal,
    guardedSend,
  };
}








