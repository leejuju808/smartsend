"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function SuppressionManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [bulk, setBulk] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/suppressions");
      const j = await r.json();
      setRows(j.data || []);
    } catch (e) {
      console.error("Failed to load suppressions", e);
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    const emails = bulk.split(/\s|,|;/).map(s=>s.trim()).filter(Boolean);
    if (!emails.length) return;
    
    setLoading(true);
    try {
      await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, reason: "manual" })
      });
      setBulk("");
      await load();
    } catch (e) {
      console.error("Failed to add suppressions", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global Suppression List</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Paste emails separated by commas or spaces…"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            disabled={loading}
          />
          <Button onClick={add} disabled={loading || !bulk.trim()}>
            Add
          </Button>
        </div>
        <div className="rounded-xl border divide-y">
          {rows.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              No suppressions yet
            </div>
          ) : (
            rows.map((r: any) => (
              <div key={r.id} className="p-3 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">{r.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant="secondary">{r.reason}</Badge>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}















