"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface CheckoutButtonProps {
  workspaceId: string;
  priceId: string;
  quantity?: number;
  mode?: "subscription" | "payment";
  children?: React.ReactNode;
}

export function CheckoutButton({ 
  workspaceId, 
  priceId, 
  quantity = 1,
  mode = "subscription",
  children 
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const go = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          workspaceId, 
          priceId,
          quantity,
          mode,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to create checkout session");
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert("No checkout URL returned");
        setLoading(false);
      }
    } catch (error) {
      console.error("Error creating checkout:", error);
      alert("Failed to create checkout session");
      setLoading(false);
    }
  };

  return (
    <Button onClick={go} disabled={loading}>
      {loading ? "Loading..." : children || "Subscribe"}
    </Button>
  );
}








