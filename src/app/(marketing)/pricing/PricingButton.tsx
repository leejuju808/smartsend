"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

export function PricingButton({ userId, priceId, planName }: { userId: string | null; priceId: string; planName: string }) {
  const [loading, setLoading] = useState(false);

  async function createCheckout() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const res = await fetch(`${baseUrl}/functions/v1/billing/create-checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId, price_id: priceId })
      });
      const j = await res.json();
      if (j?.url) {
        window.location.href = j.url;
      } else {
        alert("Failed to create checkout: " + (j.error || "Unknown error"));
        setLoading(false);
      }
    } catch (e: any) {
      alert("Error: " + (e.message || "Failed to create checkout"));
      setLoading(false);
    }
  }

  if (!userId) {
    return (
      <Link href="/login">
        <Button className="mt-2 w-full">Sign in to get {planName}</Button>
      </Link>
    );
  }

  return (
    <Button className="mt-2 w-full" onClick={createCheckout} disabled={loading}>
      {loading ? "Loading..." : `Get ${planName}`}
    </Button>
  );
}





