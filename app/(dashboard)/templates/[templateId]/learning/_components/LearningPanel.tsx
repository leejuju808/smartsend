"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Template = {
  id: string;
  name: string;
  status: string;
  explore_ratio: number;
  account_id: string;
};

type Version = {
  id: string;
  status: "live" | "candidate" | "disabled";
  author: "human" | "ai";
  subject: string | null;
  body: string;
  created_at: string;
  parent_version_id: string | null;
  notes: string | null;
  weight: number | null;
};

type PerfRow = {
  version_id: string;
  template_id: string;
  sends_14d: number;
  wins_14d: number;
  unsub_14d: number;
  bounce_14d: number;
  reply_rate_smoothed: number;
};

export default function LearningPanel({
  template,
  versions,
  perf,
}: {
  template: Template;
  versions: Version[];
  perf: PerfRow[];
}) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [exploreRatio, setExploreRatio] = useState(template.explore_ratio ?? 0);
  const [savingRatio, setSavingRatio] = useState(false);
  const perfMap = useMemo(() => {
    const map = new Map<string, PerfRow>();
    for (const row of perf) map.set(row.version_id, row);
    return map;
  }, [perf]);

  const parentMap = useMemo(() => {
    const map = new Map<string, Version>();
    for (const row of versions) map.set(row.id, row);
    return map;
  }, [versions]);

  const liveVersions = versions.filter((v) => v.status === "live");
  const candidateVersions = versions.filter((v) => v.status === "candidate");
  const disabledVersions = versions.filter((v) => v.status === "disabled");

  const liveWeight = liveVersions.reduce(
    (sum, v) => sum + (v.weight ?? 1),
    0,
  );
  const candidateWeight = candidateVersions.reduce(
    (sum, v) => sum + (v.weight ?? 1),
    0,
  );

  async function persistExploreRatio() {
    setSavingRatio(true);
    try {
      await supabase
        .from("smart_templates")
        .update({ explore_ratio: exploreRatio })
        .eq("id", template.id);
      router.refresh();
    } finally {
      setSavingRatio(false);
    }
  }

  async function markVersion(
    id: string,
    updates: Partial<Pick<Version, "status" | "weight">>,
  ) {
    await supabase
      .from("smart_template_versions")
      .update(updates)
      .eq("id", id);
    router.refresh();
  }

  async function handleSetWeight(version: Version) {
    const input = window.prompt(
      "Set sampling weight (0.1 - 5.0)",
      String(version.weight ?? 1),
    );
    if (!input) return;
    const value = Number(input);
    if (Number.isNaN(value) || value <= 0) {
      alert("Enter a positive number.");
      return;
    }
    await markVersion(version.id, { weight: value });
  }

  async function triggerRewrite() {
    const res = await fetch(`/api/templates/${template.id}/rewrite`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Failed to queue rewrite.");
      return;
    }
    router.refresh();
  }

  const renderDiff = (version: Version) => {
    const base = version.parent_version_id
      ? parentMap.get(version.parent_version_id)
      : null;
    const subjectDiff = diffWords(
      base?.subject ?? "",
      version.subject ?? "",
    ).slice(0, 200);
    const parentBodySnippet = (base?.body ?? "").slice(0, 200);
    const candidateSnippet = version.body.slice(0, 200);

    return (
      <div className="space-y-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Subject Diff
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed">
            {subjectDiff.map((token, idx) => (
              <span
                key={idx}
                className={cn(
                  token.type === "add" && "bg-emerald-500/20 text-emerald-900 dark:text-emerald-200",
                  token.type === "remove" && "bg-rose-500/20 line-through text-rose-900 dark:text-rose-200",
                )}
              >
                {token.text}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Parent (first 200 chars)
            </div>
            <p className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {parentBodySnippet || "—"}
            </p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Candidate
            </div>
            <p className="rounded-md border border-border bg-emerald-500/10 p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {candidateSnippet}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Learning Template · {template.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor performance, tune traffic split, and manage candidates for continuous improvement.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {liveVersions.concat(candidateVersions).map((version) => {
          const stats = perfMap.get(version.id);
          return (
            <Card key={version.id}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {version.subject || "Untitled variant"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Metric label="Status" value={version.status} />
                <Metric
                  label="14d Sends"
                  value={String(stats?.sends_14d ?? 0)}
                />
                <Metric
                  label="14d Replies"
                  value={String(stats?.wins_14d ?? 0)}
                />
                <Metric
                  label="Smoothed Reply Rate"
                  value={`${((stats?.reply_rate_smoothed ?? 0) * 100).toFixed(1)}%`}
                />
                <Metric
                  label="Weight"
                  value={String(version.weight ?? 1)}
                />
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Traffic Split
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Explore ratio</div>
              <p className="text-xs text-muted-foreground">
                Portion of sends allocated to candidate pool.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.05}
                value={exploreRatio}
                onChange={(e) => setExploreRatio(Number(e.target.value))}
              />
              <span className="w-12 text-right text-sm font-medium">
                {(exploreRatio * 100).toFixed(0)}%
              </span>
              <Button
                size="sm"
                onClick={persistExploreRatio}
                disabled={savingRatio}
              >
                {savingRatio ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TrafficTile
              label="Live pool"
              value={liveWeight}
              caption={`${liveVersions.length} versions`}
            />
            <TrafficTile
              label="Candidate pool"
              value={candidateWeight}
              caption={`${candidateVersions.length} versions`}
            />
          </div>
        </CardContent>
      </Card>

      <section className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Candidates</h2>
        <Button onClick={triggerRewrite} variant="secondary">
          Generate 2 new candidates
        </Button>
      </section>

      <div className="space-y-4">
        {candidateVersions.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No candidate variants yet. Generate new rewrites to start testing.
            </CardContent>
          </Card>
        )}

        {candidateVersions.map((version) => {
          const stats = perfMap.get(version.id);
          return (
            <Card key={version.id}>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">
                    {version.subject || "Untitled candidate"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Added {new Date(version.created_at).toLocaleString()} · {version.notes || "AI rewrite"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => markVersion(version.id, { status: "live", weight: 1 })}>
                    Approve (promote)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSetWeight(version)}
                  >
                    Set weight
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => markVersion(version.id, { status: "disabled", weight: 0 })}
                  >
                    Disable
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="14d Sends" value={String(stats?.sends_14d ?? 0)} />
                  <Metric label="14d Replies" value={String(stats?.wins_14d ?? 0)} />
                  <Metric
                    label="Smoothed Reply Rate"
                    value={`${((stats?.reply_rate_smoothed ?? 0) * 100).toFixed(1)}%`}
                  />
                  <Metric label="Weight" value={String(version.weight ?? 1)} />
                </div>
                {renderDiff(version)}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {disabledVersions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Disabled</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {disabledVersions.map((version) => (
              <Card key={version.id}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    {version.subject || "Untitled"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {version.notes || "Disabled candidate"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <p>Added {new Date(version.created_at).toLocaleString()}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markVersion(version.id, { status: "candidate", weight: 1 })}
                  >
                    Re-enable
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function TrafficTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value.toFixed(1)}</div>
      <div className="text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

type DiffToken = { type: "same" | "add" | "remove"; text: string };

function diffWords(a: string, b: string): DiffToken[] {
  const tokensA = a.split(/(\s+)/);
  const tokensB = b.split(/(\s+)/);
  const max = Math.max(tokensA.length, tokensB.length);
  const out: DiffToken[] = [];
  for (let i = 0; i < max; i++) {
    const wordA = tokensA[i] ?? "";
    const wordB = tokensB[i] ?? "";
    if (wordA === wordB) {
      if (wordB) out.push({ type: "same", text: wordB });
      continue;
    }
    if (wordA) out.push({ type: "remove", text: wordA });
    if (wordB) out.push({ type: "add", text: wordB });
  }
  return out;
}


