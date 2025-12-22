"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type MeetingSuggestion = {
  id: string;
  source: 'llm' | 'link_detect' | 'pattern';
  link: string | null;
  timezone: string | null;
  proposed_times: string[] | null;
  confidence: number;
  note: string | null;
};

export function MeetingPanel({ emailId }: { emailId: string }) {
  const [rows, setRows] = useState<MeetingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const r = await fetch(`/api/meetings/suggestions?emailId=${emailId}`);
      const j = await r.json();
      setRows(j.data || []);
    } catch (err) {
      console.error("Failed to load meeting suggestions", err);
    } finally {
      setLoading(false);
    }
  }

  async function createTask(suggId: string) {
    try {
      await fetch(`/api/meetings/create-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggId })
      });
      await load();
    } catch (err) {
      console.error("Failed to create task", err);
    }
  }

  useEffect(() => {
    if (emailId) {
      load();
    }
  }, [emailId]);

  if (loading) {
    return null;
  }

  if (!rows.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduling Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between border rounded-lg p-2">
            <div className="text-sm space-y-1">
              {r.link ? (
                <div>
                  <a 
                    className="underline text-blue-600 hover:text-blue-800" 
                    href={r.link} 
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open scheduler link
                  </a>
                </div>
              ) : null}
              {r.proposed_times?.length ? (
                <div className="text-muted-foreground">
                  Proposed: {r.proposed_times.slice(0, 3).join(" · ")}
                </div>
              ) : null}
              {r.timezone ? (
                <div className="text-muted-foreground text-xs">
                  TZ: {r.timezone}
                </div>
              ) : null}
              {r.note ? (
                <div className="text-muted-foreground text-xs italic">
                  {r.note}
                </div>
              ) : null}
            </div>
            <Button 
              size="sm" 
              onClick={() => createTask(r.id)}
            >
              Create Meeting Task
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}















