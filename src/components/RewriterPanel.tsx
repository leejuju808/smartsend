"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/badge";

type Props = {
  campaignId: string;
  stepNo: number;
  baseSubject: string;
  baseHtml: string;
  onSavedVariant?: (variantId: string) => void;
};

export default function RewriterPanel({
  campaignId,
  stepNo,
  baseSubject,
  baseHtml,
  onSavedVariant
}: Props) {
  const [tone, setTone] = useState("concise");
  const [length, setLength] = useState("short");
  const [level, setLevel] = useState("8th");
  const [pers, setPers] = useState("light");
  const [loading, setLoading] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [subj, setSubj] = useState("");
  const [html, setHtml] = useState("");
  const [mergeOk, setMergeOk] = useState<boolean | null>(null);
  const [spam, setSpam] = useState<number | null>(null);

  async function rewrite() {
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/smart-rewriter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: campaignId,
            step_no: stepNo,
            base_subject: baseSubject,
            base_body_html: baseHtml,
            tone,
            target_length: length,
            reading_level: level,
            personalization: pers
          })
        }
      );
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "rewrite failed");
      setDraftId(j.draft_id);
      setSubj(j.result_subject);
      setHtml(j.result_body_html);
      setMergeOk(j.merge_ok);
      setSpam(j.spam_score);
    } catch (e: any) {
      alert(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function saveAsVariant() {
    if (!draftId) return;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/save_draft_as_variant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`
        },
        body: JSON.stringify({ p_draft: draftId, p_name: "AI" })
      }
    );
    const j = await res.json();
    if (j) onSavedVariant?.(j as string);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Smart Rewriter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger>
              <SelectValue placeholder="Tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concise">Concise</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="playful">Playful</SelectItem>
            </SelectContent>
          </Select>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger>
              <SelectValue placeholder="Length" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger>
              <SelectValue placeholder="Reading level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6th">6th</SelectItem>
              <SelectItem value="8th">8th</SelectItem>
              <SelectItem value="10th">10th</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pers} onValueChange={setPers}>
            <SelectTrigger>
              <SelectValue placeholder="Personalization" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="strong">Strong</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={rewrite} disabled={loading}>
          {loading ? "Rewriting…" : "Rewrite"}
        </Button>

        {draftId && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {mergeOk ? (
                <Badge variant="outline">Merge OK</Badge>
              ) : (
                <Badge variant="destructive">Merge Mismatch</Badge>
              )}
              {spam !== null ? (
                <Badge
                  variant={
                    spam < 0.35 ? "outline" : spam < 0.7 ? "secondary" : "destructive"
                  }
                >
                  Spam score: {(spam * 100).toFixed(0)}%
                </Badge>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Subject</div>
              <Textarea value={subj} onChange={(e) => setSubj(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Body (HTML)</div>
              <Textarea
                className="min-h-[180px]"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveAsVariant} disabled={!mergeOk}>
                Save as Variant
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}











