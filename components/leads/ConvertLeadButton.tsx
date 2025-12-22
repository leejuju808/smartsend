"use client";

// Block 22370 — SmartSend Roofing Lead → Job Auto-Conversion v1
// Convert Lead Button Component
// Converts a qualified lead into a Job with one click

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase } from "lucide-react";

interface ConvertLeadButtonProps {
  leadId: string;
  disabled?: boolean;
  className?: string;
}

export function ConvertLeadButton({
  leadId,
  disabled = false,
  className = "",
}: ConvertLeadButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleConvert() {
    if (loading || disabled) return;

    setLoading(true);

    try {
      const res = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to convert lead");
      }

      if (json.success && json.job_id) {
        // Redirect to the new job page
        // Route structure: app/(dashboard)/jobs/[jobId]/page.tsx
        router.push(`/jobs/${json.job_id}`);
        router.refresh();
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      console.error("Convert lead error:", error);
      alert(error.message || "Failed to convert lead. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleConvert}
      disabled={loading || disabled}
      className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Converting...
        </>
      ) : (
        <>
          <Briefcase className="mr-2 h-4 w-4" />
          Convert to Job
        </>
      )}
    </Button>
  );
}

