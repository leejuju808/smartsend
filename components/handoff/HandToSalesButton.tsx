// Example UI Component: "Hand to Sales" Button
// Add this to your thread view component

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button"; // Adjust import path as needed

interface HandToSalesButtonProps {
  threadId: string;
  disabled?: boolean;
}

export function HandToSalesButton({ threadId, disabled }: HandToSalesButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleHandoff = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to hand off to sales");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <Button
        onClick={handleHandoff}
        disabled={disabled || loading}
        className={success ? "bg-green-500 hover:bg-green-600" : ""}
      >
        {loading ? "Handing off..." : success ? "✓ Handed to Sales" : "🤝 Hand to Sales"}
      </Button>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}












