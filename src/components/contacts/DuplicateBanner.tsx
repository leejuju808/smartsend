"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface DuplicateBannerProps {
  workspaceId?: string;
}

export function DuplicateBanner({ workspaceId }: DuplicateBannerProps) {
  const [duplicateCount, setDuplicateCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDuplicateCount();
  }, [workspaceId]);

  async function fetchDuplicateCount() {
    try {
      const url = workspaceId
        ? `/api/contacts/duplicates?workspace_id=${workspaceId}`
        : "/api/contacts/duplicates";
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.groups && data.groups.length > 0) {
        const totalDuplicates = data.groups.reduce(
          (sum: number, group: any) => sum + group.contacts.length,
          0
        );
        setDuplicateCount(totalDuplicates);
      } else {
        setDuplicateCount(0);
      }
    } catch (error) {
      console.error("Failed to fetch duplicate count:", error);
      setDuplicateCount(0);
    } finally {
      setLoading(false);
    }
  }

  if (loading || duplicateCount === null || duplicateCount === 0) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-yellow-800 font-medium">
          {duplicateCount} potential duplicate{duplicateCount !== 1 ? "s" : ""} found
        </span>
        <span className="text-yellow-700 text-sm">
          — Review & merge to keep your contacts organized
        </span>
      </div>
      <Link href="/contacts/duplicates">
        <Button variant="outline" size="sm">
          Review & Merge
        </Button>
      </Link>
    </div>
  );
}





























































