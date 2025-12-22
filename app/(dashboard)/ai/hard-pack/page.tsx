'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type BucketRow = {
  bucket: string;
  gold_label: string;
  pred_label: string;
  count: number;
};

export default function HardPack() {
  const [evalSetId, setEvalSetId] = useState<string>("");
  const [modelVersionId, setModelVersionId] = useState<string>("");
  const [buckets, setBuckets] = useState<BucketRow[]>([]);

  const genHard = async () => {
    const res = await fetch("/api/ai/eval/generate-hard", {
      method: "POST",
      body: JSON.stringify({ size: 250 }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error ?? "hard-pack failed");
      return;
    }
    setEvalSetId(json.eval_set_id);
    toast.success(`Hard pack created (${json.inserted})`);
  };

  const augment = async () => {
    if (!evalSetId) {
      toast.error("Generate hard pack first");
      return;
    }
    const res = await fetch("/api/ai/augment/paraphrase", {
      method: "POST",
      body: JSON.stringify({ eval_set_id: evalSetId, n: 2, temperature: 0.7 }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error ?? "augment failed");
      return;
    }
    toast.success(`Paraphrases created (${json.created})`);
  };

  const bucketize = async () => {
    if (!evalSetId || !modelVersionId) {
      toast.error("Need evalSetId & modelVersionId");
      return;
    }
    const res = await fetch("/api/ai/eval/bucketize", {
      method: "POST",
      body: JSON.stringify({ eval_set_id: evalSetId, model_version_id: modelVersionId }),
    });
    const json = await res.json();
    if (!json.ok) {
      toast.error(json.error ?? "bucketize failed");
      return;
    }
    toast.success(`Bucketized ${json.inserted}`);

    const listRes = await fetch(
      `/api/ai/buckets/list?eval_set_id=${encodeURIComponent(evalSetId)}&model_version_id=${encodeURIComponent(modelVersionId)}`
    );
    const listJson = await listRes.json();
    setBuckets(listJson.data ?? []);
  };

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Hard Eval Pack</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <Button onClick={genHard}>Generate Hard Pack (250)</Button>
          <Button variant="secondary" onClick={augment} disabled={!evalSetId}>
            Paraphrase x2 per sample
          </Button>
          <Input
            placeholder="model_version_id"
            value={modelVersionId}
            onChange={(e) => setModelVersionId(e.target.value)}
            className="md:max-w-xs"
          />
          <Button variant="outline" onClick={bucketize} disabled={!evalSetId || !modelVersionId}>
            Bucketize Errors
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Error Buckets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {buckets.map((bucket, idx) => (
              <div key={`${bucket.bucket}-${idx}`} className="rounded-2xl border p-4">
                <div className="font-medium">
                  {bucket.bucket} — {bucket.count}
                </div>
                <div className="text-xs text-muted-foreground">
                  Top gold→pred: {bucket.gold_label}→{bucket.pred_label}
                </div>
              </div>
            ))}
            {!buckets.length && <div className="text-sm text-muted-foreground">No buckets yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

















