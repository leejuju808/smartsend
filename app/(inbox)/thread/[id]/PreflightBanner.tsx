"use client";

import * as React from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Payload = {
  account_id: string;
  message_id?: string;
  from_email: string;
  to_email: string;
  subject: string;
  html?: string;
  text?: string;
};

type PreflightResponse = {
  severity: "ok" | "warn" | "fail";
  checks: Array<{ key: string; severity: string; ok: boolean; msg: string }>;
  failing?: string[];
};

type PreflightBannerProps = {
  payload: Payload;
  onResult?: (res: PreflightResponse | null) => void;
};

export function PreflightBanner({ payload, onResult }: PreflightBannerProps) {
  const [res, setRes] = React.useState<PreflightResponse | null>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const json = (await response.json()) as PreflightResponse;
      setRes(json);
    } catch (error) {
      console.error("preflight failed", error);
      setRes(null);
    } finally {
      setLoading(false);
    }
  }, [payload]);

  React.useEffect(() => {
    run();
  }, [run]);

  React.useEffect(() => {
    onResult?.(res);
  }, [onResult, res]);

  const severity = res?.severity ?? "ok";
  const failing = (res?.checks ?? []).filter((c) => !c.ok);

  return (
    <Card
      className={`border ${severity === "fail" ? "border-red-500" : severity === "warn" ? "border-amber-500" : "border-emerald-500"} rounded-2xl p-3`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {severity === "ok" ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircle
              className={`h-4 w-4 ${severity === "fail" ? "text-red-600" : "text-amber-600"}`}
            />
          )}
          <span className="font-medium">
            {severity === "ok"
              ? "All checks passed"
              : severity === "warn"
              ? "Warnings detected"
              : "Preflight failed"}
          </span>
          {failing.length > 0 && <span className="opacity-70">• {failing.length} issue(s)</span>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            {loading ? "Checking…" : "Recheck"}
          </Button>
          <Button size="sm" onClick={() => setOpen((prev) => !prev)}>
            {open ? "Hide" : "Details"}
          </Button>
        </div>
      </div>
      {open && (
        <ul className="mt-2 space-y-1 text-xs">
          {(res?.checks ?? []).map((check, index) => (
            <li
              key={check.key ?? index}
              className={`flex justify-between rounded-lg border px-2 py-1 ${
                !check.ok
                  ? check.severity === "fail"
                    ? "border-red-300"
                    : "border-amber-300"
                  : "border-transparent"
              }`}
            >
              <span className="font-medium">{check.key}</span>
              <span
                className={`${
                  !check.ok
                    ? check.severity === "fail"
                      ? "text-red-700"
                      : "text-amber-700"
                    : "text-slate-600"
                }`}
              >
                {check.msg}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

