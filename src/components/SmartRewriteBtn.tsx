import { useState } from "react";
import { Button } from "@/components/ui/button";

type Variant = { subject?: string; html?: string };

export function SmartRewriteBtn({
  subject,
  html,
  onChoose
}: { subject: string; html: string; onChoose: (v: Variant) => void }) {
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [subjectOnly, setSubjectOnly] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/functions/v1/smart-rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          html: subjectOnly ? "" : html,
          goals: ["clearer", "concise", "avoid spam words"],
          tone: "professional",
          length: "short",
          reading_level: "business",
          keep_unsub: true,
          variant_count: 3
        })
      });
      const j = await res.json();
      setVariants(j.variants || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button onClick={run} disabled={loading}>
          {loading ? "Rewriting..." : "Rewrite with AI"}
        </Button>
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={subjectOnly}
            onChange={(e) => setSubjectOnly(e.target.checked)}
          />
          Subject only
        </label>
      </div>
      {variants.length > 0 && (
        <div className="grid gap-2">
          {variants.map((v, i) => (
            <div key={i} className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground mb-1">Variant {i + 1}</div>
              <div className="font-medium mb-1">{v.subject || "(no subject change)"}</div>
              {v.html ? (
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: v.html }} />
              ) : null}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => onChoose(v)}>Use this</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


