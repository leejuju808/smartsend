"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { MergeCompare } from "@/components/leads/merge/compare";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MergePage({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = use(params);
  const router = useRouter();
  const { data, error, isLoading } = useSWR(`/api/leads/merge/${a}/${b}`, fetcher);

  async function handleMerge(selectedFields: Record<string, unknown>) {
    try {
      const response = await fetch(`/api/leads/merge/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          winner_id: a,
          loser_id: b,
          fields: selectedFields,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to merge leads");
      }

      // Redirect to the merged lead page
      router.push(`/leads/${a}`);
    } catch (error) {
      console.error("Merge error:", error);
      alert(error instanceof Error ? error.message : "Failed to merge leads");
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-6">Merge Leads</h1>
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-6">Merge Leads</h1>
        <div className="text-center py-8 text-red-500">
          {error?.message || "Failed to load leads"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Merge Leads</h1>
      <p className="text-muted-foreground mb-6">
        Compare the two leads side-by-side and choose which values to keep. All tags, notes, timeline events, and reply threads will be merged automatically.
      </p>
      <MergeCompare a={data.a} b={data.b} onMerge={handleMerge} />
    </div>
  );
}










