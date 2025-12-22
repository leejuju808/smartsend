"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";

type KW = { id: string; user_id: string | null; phrase: string };

export function OptOutGuard() {
  const [global, setGlobal] = useState<KW[]>([]);
  const [mine, setMine] = useState<KW[]>([]);
  const [newPhrase, setNewPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/optout/keywords");
      const j = await r.json();
      if (r.ok) {
        setGlobal(j.global || []);
        setMine(j.mine || []);
      } else {
        alert(j.error || "Failed to load keywords");
      }
    } catch (error) {
      console.error("Error loading keywords:", error);
      alert("Failed to load keywords");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!newPhrase.trim()) return;

    setLoading(true);
    try {
      const r = await fetch("/api/optout/keywords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phrase: newPhrase.trim() }),
      });

      if (r.ok) {
        setNewPhrase("");
        await load();
      } else {
        const j = await r.json();
        alert(j.error || "Add failed");
      }
    } catch (error) {
      console.error("Error adding keyword:", error);
      alert("Failed to add keyword");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this keyword?")) return;

    setLoading(true);
    try {
      const r = await fetch(`/api/optout/keywords?id=${id}`, {
        method: "DELETE",
      });

      if (r.ok) {
        await load();
      } else {
        const j = await r.json();
        alert(j.error || "Delete failed");
      }
    } catch (error) {
      console.error("Error removing keyword:", error);
      alert("Failed to remove keyword");
    } finally {
      setLoading(false);
    }
  }

  async function backfill() {
    if (!confirm("Backfill last 60 days of messages? This may take a moment.")) {
      return;
    }

    setBackfilling(true);
    try {
      const r = await fetch("/api/optout/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 60 }),
      });

      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Backfill failed");
      } else {
        alert(`Updated ${j.updated} threads/leads`);
      }
    } catch (error) {
      console.error("Error running backfill:", error);
      alert("Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="text-sm font-medium">Opt-Out Guardrails</div>
      <p className="text-sm text-muted-foreground">
        Automatically detect and honor opt-out requests in inbound messages. 
        When a keyword is detected, the lead will be marked as opted out and future emails will be cancelled.
      </p>

      <div className="space-y-2">
        <Label className="text-xs">Add keyword (your workspace)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g., 'please remove'"
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                add();
              }
            }}
            disabled={loading}
          />
          <Button onClick={add} disabled={loading || !newPhrase.trim()}>
            Add
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold mb-2">Global defaults</div>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {global.length === 0 ? (
              <li className="text-muted-foreground">No global keywords</li>
            ) : (
              global.map((k) => <li key={k.id}>{k.phrase}</li>)
            )}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold mb-2">Your keywords</div>
          <ul className="text-sm space-y-1">
            {mine.length === 0 ? (
              <li className="text-muted-foreground">No custom keywords</li>
            ) : (
              mine.map((k) => (
                <li key={k.id} className="flex items-center justify-between">
                  <span>{k.phrase}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => remove(k.id)}
                    disabled={loading}
                  >
                    Remove
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <Button
          variant="secondary"
          onClick={backfill}
          disabled={backfilling || loading}
        >
          {backfilling ? "Backfilling..." : "Backfill last 60 days"}
        </Button>
      </div>
    </Card>
  );
}



