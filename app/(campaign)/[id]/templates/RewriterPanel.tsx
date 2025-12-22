"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Variant = {
  id: string;
  subject: string;
  body: string;
  score?: number;
  notes?: string;
};

type PanelProps = {
  campaignId: string;
  templateId: string;
};

export default function RewriterPanel({ campaignId, templateId }: PanelProps) {
  const [tone, setTone] = useState("concise");
  const [len, setLen] = useState("short");
  const [cta, setCta] = useState("soft");
  const [avoid, setAvoid] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, []);

  const start = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rewrite/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          templateId,
          tone,
          targetLength: len,
          constraints: {
            cta,
            avoid: avoid
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
          requestedVariants: count,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to start rewrite");
        return;
      }

      setJobId(data.jobId);
      setVariants([]);
      toast.success("Generating variants…");
      await fetchResults(data.jobId);
    } catch (err) {
      console.error(err);
      toast.error("Network error starting rewrite");
    } finally {
      setLoading(false);
    }
  };

  const fetchResults = async (id: string) => {
    try {
      const res = await fetch(`/api/rewrite/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.variants) {
        setVariants(data.variants);
        if (data?.job?.status !== "done") {
          if (pollRef.current) window.clearTimeout(pollRef.current);
          pollRef.current = window.setTimeout(() => fetchResults(id), 1500);
        } else if (pollRef.current) {
          window.clearTimeout(pollRef.current);
          pollRef.current = null;
        }
      } else if (!res.ok) {
        toast.error(data.error || "Failed to fetch variants");
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error fetching variants");
    }
  };

  const useVariant = async (variantId: string) => {
    try {
      const res = await fetch("/api/rewrite/use-as-variant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, campaignId, scenario: "no_reply", tone }),
      });
      const data = await res.json();
      if (res.ok) toast.success("Saved as A/B variant");
      else toast.error(data.error || "Save failed");
    } catch (err) {
      console.error(err);
      toast.error("Network error saving variant");
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Smart Template Rewriter (AI)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs mb-1">Tone</div>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue placeholder="Tone" />
              </SelectTrigger>
              <SelectContent>
                {["concise", "friendly", "assertive", "professional", "curious"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs mb-1">Length</div>
            <Select value={len} onValueChange={setLen}>
              <SelectTrigger>
                <SelectValue placeholder="Length" />
              </SelectTrigger>
              <SelectContent>
                {["short", "medium", "long"].map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs mb-1">CTA</div>
            <Select value={cta} onValueChange={setCta}>
              <SelectTrigger>
                <SelectValue placeholder="CTA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="soft">soft</SelectItem>
                <SelectItem value="direct">direct</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs mb-1">Variants</div>
            <Input
              type="number"
              min={1}
              max={6}
              value={count}
              onChange={(e) => {
                const value = Number(e.target.value);
                setCount(Number.isNaN(value) ? 1 : value);
              }}
            />
          </div>
        </div>

        <div>
          <div className="text-xs mb-1">Avoid words (comma separated)</div>
          <Textarea
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            placeholder="discount, free, buy now"
          />
        </div>

        <Button onClick={start} disabled={loading}>
          {loading ? "Generating…" : "Generate"}
        </Button>

        {jobId && variants.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Waiting for variants… refresh if this takes more than a few seconds.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {variants.map((v) => (
            <Card key={v.id} className="rounded-xl">
              <CardContent className="pt-4 space-y-2">
                <div className="text-sm font-semibold">Subject</div>
                <div className="text-sm">{v.subject}</div>
                <div className="text-sm font-semibold mt-2">Body</div>
                <pre className="whitespace-pre-wrap text-sm">{v.body}</pre>
                <div className="text-xs text-muted-foreground mt-2">
                  Score: {v.score?.toFixed?.(2) ?? "0.00"}
                  {v.notes ? ` • ${v.notes}` : ""}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => useVariant(v.id)}>
                    Use as Variant
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


