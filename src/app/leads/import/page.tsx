"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SchedulePreview } from "@/components/schedule-preview";

const FIELDS = ["email", "first_name", "last_name", "company", "title", "domain", "phone", "tz"] as const;

type Mapping = Record<string, string | null>;
type PreviewRow = { row_no: number; raw: Record<string, string>; valid?: boolean | null; errors?: string[] | null };
type JobState = { id: string; path: string } | null;

type ImportRow = {
  id: string;
  raw: Record<string, any> | null;
  normalized: Record<string, any> | null;
  valid: boolean | null;
  errors: string[] | null;
};

function useSB() {
  return useMemo(
    () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
    [],
  );
}

export default function ImportPage() {
  const sb = useSB();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobState>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>(() => {
    const initial: Mapping = {};
    for (const f of FIELDS) initial[f] = null;
    return initial;
  });
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [stats, setStats] = useState({ good: 0, bad: 0, total: 0 });
  const [invalidRows, setInvalidRows] = useState<ImportRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined);
  const [stepNo, setStepNo] = useState(1);
  const [startAt, setStartAt] = useState<string>("");
  const [perMin, setPerMin] = useState(20);
  const [jitter, setJitter] = useState(45);
  const [businessHours, setBusinessHours] = useState(false);
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [skipHolidays, setSkipHolidays] = useState(true);
  const businessDays = [1, 2, 3, 4, 5];
  const [previewLeadIds, setPreviewLeadIds] = useState<string[]>([]);
  const [previewLeadIdsLoading, setPreviewLeadIdsLoading] = useState(false);
  const [previewLeadIdsError, setPreviewLeadIdsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toUtcIsoLocal(localStr: string) {
    if (!localStr) return null;
    const d = new Date(localStr);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  }

  const loadInvalidRows = async () => {
    if (!job?.id) {
      setInvalidRows([]);
      setLoadingRows(false);
      return;
    }
    setLoadingRows(true);
    const { data, error } = await sb
      .from("import_rows")
      .select("id, raw, normalized, valid, errors")
      .eq("job_id", job.id)
      .eq("valid", false)
      .limit(1000);
    if (!error) {
      const rows = (data as any[]) ?? [];
      setInvalidRows(
        rows.map((r) => ({
          id: r.id as string,
          raw: (r.raw as Record<string, any>) ?? null,
          normalized: (r.normalized as Record<string, any>) ?? null,
          valid: r.valid as boolean | null,
          errors: Array.isArray(r.errors)
            ? (r.errors as string[])
            : r.errors
              ? [String(r.errors)]
              : [],
        })),
      );
    } else {
      console.error(error);
    }
    setLoadingRows(false);
  };

  useEffect(() => {
    if (job?.id) {
      loadInvalidRows();
    } else {
      setInvalidRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  useEffect(() => {
    if (!job?.id || stats.good === 0) {
      setPreviewLeadIds([]);
      setPreviewLeadIdsLoading(false);
      setPreviewLeadIdsError(null);
      return;
    }

    let cancelled = false;
    const pageSize = 1000;
    const maxPages = 20;
    const chunkSize = 200;

    async function gather() {
      setPreviewLeadIdsLoading(true);
      setPreviewLeadIdsError(null);
      try {
        const emails = new Set<string>();
        for (let page = 0; page < maxPages; page += 1) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await sb
            .from("import_rows")
            .select("normalized")
            .eq("job_id", job.id)
            .eq("valid", true)
            .range(from, to);
          if (error) throw error;
          const batch = (data as any[]) ?? [];
          for (const row of batch) {
            const normalized = (row as { normalized?: Record<string, any> }).normalized ?? {};
            const emailRaw = (normalized?.email as string | undefined) ?? null;
            if (emailRaw) {
              const email = emailRaw.trim().toLowerCase();
              if (email) emails.add(email);
            }
          }
          if (batch.length < pageSize) {
            break;
          }
        }

        if (cancelled) return;

        if (emails.size === 0) {
          setPreviewLeadIds([]);
          return;
        }

        const ids = new Set<string>();
        const emailArr = Array.from(emails);
        for (let i = 0; i < emailArr.length; i += chunkSize) {
          if (cancelled) return;
          const chunk = emailArr.slice(i, i + chunkSize);
          const { data, error } = await sb.from("leads").select("id").in("email", chunk);
          if (error) throw error;
          for (const lead of data ?? []) {
            const id = (lead as { id?: string }).id;
            if (id) ids.add(id);
          }
        }

        if (cancelled) return;

        setPreviewLeadIds(Array.from(ids));
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPreviewLeadIds([]);
          setPreviewLeadIdsError(err instanceof Error ? err.message : "Unable to resolve leads for preview");
        }
      } finally {
        if (!cancelled) {
          setPreviewLeadIdsLoading(false);
        }
      }
    }

    void gather();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, stats.good]);

  function RowEditor({ row }: { row: ImportRow }) {
    const editKeys = ["email", "first_name", "last_name", "company", "domain", "tz"] as const;
    const toStringVal = (value: any) => (value === null || value === undefined ? "" : String(value));

    const [draft, setDraft] = useState<Record<string, string>>(() => {
      const init: Record<string, string> = {};
      const raw = row.raw || {};
      for (const key of editKeys) {
        init[key] = toStringVal((raw as Record<string, any>)[key]);
      }
      return init;
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      const raw = row.raw || {};
      const next: Record<string, string> = {};
      for (const key of editKeys) {
        next[key] = toStringVal((raw as Record<string, any>)[key]);
      }
      setDraft(next);
    }, [row.raw]);

    function setField(key: string, value: string) {
      setDraft((prev) => ({ ...prev, [key]: value }));
    }

    async function saveValidate() {
      if (!row.id) return;
      setSaving(true);
      try {
        const baseRaw = row.raw || {};
        const comparable: Record<string, string> = {};
        for (const key of editKeys) {
          comparable[key] = toStringVal((baseRaw as Record<string, any>)[key]);
        }
        const patchEntries = editKeys
          .map((key) => [key, draft[key] ?? ""] as [string, string])
          .filter(([key, value]) => comparable[key] !== value);
        const patch = Object.fromEntries(patchEntries);

        const { data, error } = await sb.rpc("import_row_patch_and_validate", {
          p_row_id: row.id,
          p_patch: patch,
        });

        if (error) {
          throw new Error(error.message || "Update failed");
        }

        const payload = Array.isArray(data) ? data[0] : data;
        const nextErrors = Array.isArray(payload?.errors)
          ? (payload.errors as string[])
          : payload?.errors
            ? [String(payload.errors)]
            : [];

        const normalized = (payload?.normalized as Record<string, any>) ?? null;
        const nextRaw: Record<string, string> = {};
        for (const key of editKeys) {
          nextRaw[key] = toStringVal(normalized?.[key] ?? draft[key] ?? "");
        }

        if (payload?.valid) {
          setInvalidRows((prev) => prev.filter((r) => r.id !== row.id));
        } else {
          setInvalidRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    raw: nextRaw,
                    normalized,
                    valid: payload?.valid ?? false,
                    errors: nextErrors,
                  }
                : r,
            ),
          );
        }
        await loadInvalidRows();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Update failed");
      } finally {
        setSaving(false);
      }
    }

    const errs = Array.isArray(row.errors) ? row.errors : [];

    return (
      <div className="border rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          {errs.length === 0 ? (
            <span className="text-xs rounded bg-green-500/10 px-2 py-1">valid</span>
          ) : (
            errs.map((e) => (
              <span key={e} className="text-xs rounded bg-red-500/10 px-2 py-1">
                {e}
              </span>
            ))
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs mb-1">Email</div>
            <Input value={draft.email || ""} onChange={(e) => setField("email", e.target.value)} placeholder="name@company.com" />
          </div>
          <div>
            <div className="text-xs mb-1">First name</div>
            <Input value={draft.first_name || ""} onChange={(e) => setField("first_name", e.target.value)} />
          </div>
          <div>
            <div className="text-xs mb-1">Last name</div>
            <Input value={draft.last_name || ""} onChange={(e) => setField("last_name", e.target.value)} />
          </div>
          <div>
            <div className="text-xs mb-1">Company</div>
            <Input value={draft.company || ""} onChange={(e) => setField("company", e.target.value)} />
          </div>
          <div>
            <div className="text-xs mb-1">Domain</div>
            <Input value={draft.domain || ""} onChange={(e) => setField("domain", e.target.value)} />
          </div>
          <div>
            <div className="text-xs mb-1">Timezone (IANA)</div>
            <Input
              value={draft.tz || ""}
              onChange={(e) => setField("tz", e.target.value)}
              placeholder="America/Los_Angeles"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={saveValidate} disabled={saving}>
            {saving ? "Saving…" : "Save & Validate"}
          </Button>
          <Button size="sm" variant="secondary" onClick={loadInvalidRows}>
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  async function uploadCSV() {
    if (!file) return;
    setLoading(true);
    try {
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const { data: jobInsert, error: jobError } = await sb
        .from("import_jobs")
        .insert({ user_id: uid })
        .select("id")
        .single();
      if (jobError || !jobInsert) throw jobError ?? new Error("Failed to create job");

      const path = `raw/${jobInsert.id}.csv`;
      const { error: uploadError } = await sb.storage.from("imports").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      setJob({ id: jobInsert.id, path });

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/csv-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobInsert.id, storage_path: path }),
      });
      const analyzed = await res.json();
      if (!res.ok || !analyzed.ok) throw new Error(analyzed.error || "Analyze failed");

      setHeader(analyzed.header ?? []);
      setMapping((prev) => ({ ...prev, ...analyzed.mapping }));
      setPreview((analyzed.preview ?? []).map((r: any) => ({ ...r, valid: null, errors: [] })));
      setStats({ good: 0, bad: 0, total: analyzed.total_rows ?? 0 });
      setInvalidRows([]);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    if (!job) return;
    setLoading(true);
    try {
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      await sb.from("import_jobs").update({ mapping }).eq("id", job.id);

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/csv-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, user_id: uid }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "Validation failed");

      const { data: rows } = await sb
        .from("import_rows")
        .select("row_no,raw,valid,errors")
        .eq("job_id", job.id)
        .order("row_no", { ascending: true })
        .limit(50);

      setPreview(
        (rows ?? []).map((r) => ({
          row_no: r.row_no,
          raw: r.raw as Record<string, string>,
          valid: r.valid,
          errors: Array.isArray(r.errors)
            ? (r.errors as string[])
            : r.errors
              ? [String(r.errors)]
              : [],
        })),
      );
      setStats((prev) => ({ ...prev, good: result.good ?? 0, bad: result.bad ?? 0 }));
      loadInvalidRows();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  async function downloadErrors() {
    if (!job) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/csv-errors-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.open(json.url, "_blank");
      } else {
        throw new Error(json.error || "Unable to download errors");
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function runImport() {
    if (!job) return;
    setLoading(true);
    try {
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/csv-import-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, user_id: uid, campaign_id: campaignId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Import failed");
      alert(`Imported ${json.imported} leads`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function attachAndSchedule() {
    if (!job || !campaignId) return;
    setLoading(true);
    try {
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) throw new Error("Not authenticated");

      const startIso = startAt ? toUtcIsoLocal(startAt) ?? undefined : undefined;

      const safeStep = Number.isFinite(stepNo) && stepNo > 0 ? stepNo : 1;
      const safePerMin = Number.isFinite(perMin) && perMin > 0 ? perMin : 1;
      const safeJitter = Number.isFinite(jitter) && jitter >= 0 ? jitter : 0;

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/import-attach-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          user_id: uid,
          campaign_id: campaignId,
          step_no: safeStep,
          start_at_iso: startIso,
          per_min: safePerMin,
          jitter_seconds: safeJitter,
          business_hours: businessHours,
          window_start: windowStart,
          window_end: windowEnd,
          days: businessDays,
          skip_holidays: skipHolidays,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Attach & Schedule failed");
      alert(
        `Attached ${j.attached} and scheduled ${j.scheduled} for Step ${j.step_no} starting ${new Date(j.start_at).toLocaleString()}`,
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Attach & Schedule failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <Button onClick={uploadCSV} disabled={!file || loading}>
            Analyze
          </Button>
        </CardContent>
      </Card>

      {header.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Auto-Map Columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-40 text-sm">{f}</div>
                <Select value={mapping[f] ?? ""} onValueChange={(value) => setMapping((prev) => ({ ...prev, [f]: value || null }))}>
                  <SelectTrigger className="w-80">
                    <SelectValue placeholder="(not mapped)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">(not mapped)</SelectItem>
                    {header.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button variant="outline" onClick={validate} disabled={!job || loading}>
              Validate Preview
            </Button>
          </CardContent>
        </Card>
      )}

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Total: {stats.total} • Valid: {stats.good} • Invalid: {stats.bad}
              {stats.bad > 0 ? (
                <Button size="sm" className="ml-3" variant="secondary" onClick={downloadErrors}>
                  Download errors CSV
                </Button>
              ) : null}
            </div>
            <div className="overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {header.map((h) => (
                      <th key={h} className="p-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((r, i) => (
                    <tr
                      key={`${r.row_no}-${i}`}
                      className={r.valid === false ? "bg-destructive/10" : ""}
                      title={r.errors && r.errors.length ? r.errors.join(", ") : undefined}
                    >
                      {header.map((h) => (
                        <td key={h} className="p-2 border-t">
                          {r.raw?.[h] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>
      )}

      {job?.id && (
        <Card>
          <CardHeader>
            <CardTitle>Fix Invalid Rows</CardTitle>
            <CardDescription>
              Edit rows inline and re-validate. When 0 invalid remain, run “Attach &amp; Schedule”.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                Invalid count: <b>{invalidRows.length}</b>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (!job?.id) return;
                    setLoadingRows(true);
                    try {
                      const { data, error } = await sb.rpc("import_job_revalidate", { p_job_id: job.id });
                      if (error) throw error;
                      const recs = (data as any[]) ?? [];
                      const good = recs.filter((r) => r.valid === true).length;
                      const bad = recs.filter((r) => r.valid === false).length;
                      setStats((prev) => ({ ...prev, good, bad }));
                      await loadInvalidRows();
                    } catch (err) {
                      console.error(err);
                      alert(err instanceof Error ? err.message : "Re-validate failed");
                    } finally {
                      setLoadingRows(false);
                    }
                  }}
                >
                  Re-validate All
                </Button>
                <Button size="sm" onClick={loadInvalidRows} disabled={loadingRows}>
                  {loadingRows ? "Loading…" : "Reload"}
                </Button>
              </div>
            </div>

            {invalidRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                🎉 No invalid rows. You’re clear to Attach &amp; Schedule.
              </div>
            ) : (
              <div className="space-y-3">
                {invalidRows.slice(0, 50).map((row) => (
                  <RowEditor key={row.id} row={row} />
                ))}
                {invalidRows.length > 50 && (
                  <div className="text-xs text-muted-foreground">
                    Showing first 50. Use “Reload” as you fix them.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attach & Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs mb-1">Campaign ID</div>
                <Input
                  value={campaignId || ""}
                  onChange={(e) => setCampaignId(e.target.value || undefined)}
                  placeholder="uuid…"
                />
              </div>
              <div>
                <div className="text-xs mb-1">Step number</div>
                <Input
                  type="number"
                  min={1}
                  value={stepNo}
                  onChange={(e) => {
                    const next = Number.parseInt(e.target.value || "1", 10);
                    setStepNo(Number.isNaN(next) ? 1 : Math.max(1, next));
                  }}
                />
              </div>
              <div>
                <div className="text-xs mb-1">Start (local)</div>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                <div className="text-[11px] text-muted-foreground mt-1">Default: now + 10 min</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs mb-1">Pace (per min)</div>
                  <Input
                    type="number"
                    min={1}
                    value={perMin}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value || "20", 10);
                      setPerMin(Number.isNaN(next) ? 20 : Math.max(1, next));
                    }}
                  />
                </div>
                <div>
                  <div className="text-xs mb-1">Jitter (sec)</div>
                  <Input
                    type="number"
                    min={0}
                    value={jitter}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value || "45", 10);
                      setJitter(Number.isNaN(next) ? 45 : Math.max(0, next));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 border rounded-md p-3">
              <div className="flex items-center gap-2">
                <input
                  id="biz-hours"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={businessHours}
                  onChange={(e) => setBusinessHours(e.target.checked)}
                />
                <label htmlFor="biz-hours" className="text-sm">
                  Limit to business hours (lead local time)
                </label>
              </div>

              {businessHours ? (
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <div>
                    <div className="text-xs mb-1">Window start</div>
                    <Input
                      type="time"
                      value={windowStart}
                      onChange={(e) => setWindowStart(e.target.value || "08:00")}
                    />
                  </div>
                  <div>
                    <div className="text-xs mb-1">Window end</div>
                    <Input
                      type="time"
                      value={windowEnd}
                      onChange={(e) => setWindowEnd(e.target.value || "17:00")}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <input
                  id="holi"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={skipHolidays}
                  onChange={(e) => setSkipHolidays(e.target.checked)}
                />
                <label htmlFor="holi" className="text-sm">
                  Skip country holidays (per lead)
                </label>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Uses each lead's <code>country</code> (ISO-2) or <code>meta.country</code>. Seeded for US; add more in <code>public.holidays</code>.
              </div>
            </div>

            <div className="pl-6 space-y-2">
              <SchedulePreview
                campaignId={campaignId ?? ""}
                stepNo={stepNo}
                leadIds={previewLeadIds}
                startAtIso={startAt ? toUtcIsoLocal(startAt) ?? null : null}
                businessHours={businessHours}
                windowStart={windowStart}
                windowEnd={windowEnd}
                days={businessDays}
                skipHolidays={skipHolidays}
              />
              {previewLeadIdsLoading ? (
                <div className="text-xs text-muted-foreground">Resolving lead schedules…</div>
              ) : previewLeadIdsError ? (
                <div className="text-xs text-destructive">{previewLeadIdsError}</div>
              ) : null}
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={runImport} disabled={!campaignId || !job || stats.good === 0 || loading}>
                1) Upsert Leads Only
              </Button>
              <Button onClick={attachAndSchedule} disabled={!campaignId || !job || stats.good === 0 || loading}>
                2) Attach & Schedule
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Plan caps and RLS guards are enforced automatically during enqueue.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
