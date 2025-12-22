"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function ReviewDetail({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reply_review_items?id=eq.${params.id}&select=*`;
      const r = await fetch(url, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: "no-store",
      });
      const [row] = await r.json();
      setItem(row);
    })();
  }, [params.id]);

  async function decide(decided_label: "out_of_office" | "human") {
    if (!item) return;

    const r = await fetch("/api/review-decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_id: item.id, decided_label }),
    });
    const j = await r.json();
    if (j.ok) {
      toast.success(`Marked as ${decided_label}`);
      window.location.href = "/inbox/review";
    } else {
      toast.error(j.error || "Failed");
    }
  }

  if (!item) return null;

  const subj = item.payload?.subject ?? "(no subject)";
  const text = item.payload?.text ?? "(no body)";
  const headers = item.payload?.headers;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review Item</h1>
        <div className="text-xs text-muted-foreground">
          score {item.score ?? "—"} · proposed {item.proposed_label}
        </div>
      </div>
      <Card className="overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm">
            <span className="font-medium">Subject:</span> {subj}
          </div>
          <pre className="text-xs bg-muted p-3 rounded-lg max-h-72 overflow-auto whitespace-pre-wrap">
            {text}
          </pre>
          {headers && (
            <details className="text-xs">
              <summary className="cursor-pointer">Headers</summary>
              <pre className="bg-muted p-3 rounded-lg overflow-auto">
                {JSON.stringify(headers, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button variant="default" onClick={() => decide("human")}>
          Mark Human
        </Button>
        <Button variant="secondary" onClick={() => decide("out_of_office")}>
          Mark Out-of-Office
        </Button>
      </div>
    </div>
  );
}

