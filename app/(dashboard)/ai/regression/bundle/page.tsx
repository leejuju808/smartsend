'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function BundlePage() {
  const [name, setName] = useState("core-smoke");
  const [ids, setIds] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const eval_set_ids = ids
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!name || !eval_set_ids.length) {
      toast.error("Provide name and at least one eval set id");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch("/api/ai/regression/bundle/create", {
        method: "POST",
        body: JSON.stringify({ name, eval_set_ids }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "Failed to save bundle");
      } else {
        toast.success("Bundle saved");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Request failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Regression Bundle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
          <Textarea
            value={ids}
            onChange={(e) => setIds(e.target.value)}
            placeholder="eval_set_id, eval_set_id, ..."
          />
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Bundle"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
















