"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function VariablesSidebar({
  threadId,
  subject,
  setSubject,
  html,
  setHtml,
}: {
  threadId: string;
  subject: string;
  setSubject: (v: string) => void;
  html: string;
  setHtml: (v: string) => void;
}) {
  const [vars, setVars] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      const r = await fetch(`/api/thread/${threadId}/vars`);
      const j = await r.json().catch(() => ({}));
      setVars(j.vars ?? {});
      setLoading(false);
    })();
  }, [threadId]);

  async function preview() {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/vars-merge`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
    }).catch(() => null);
    try {
      const bag = vars;
      const rep = (s: string) =>
        s.replace(/{{[^}]+}}/g, (m) => {
          const k = m.slice(2, -2).trim();
          return bag[k] ?? "";
        });
      setSubject(rep(subject));
      setHtml(rep(html));
      toast.success("Preview merged");
    } catch {
      toast.error("Preview failed");
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 rounded-md border p-3">
      <div className="text-sm font-medium">Variables</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {Object.entries(vars).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{k}</span>
                <Input readOnly className="h-7 w-44 truncate" value={String(v ?? "")} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={preview}>
        Preview merge
      </Button>
      <div className="text-xs text-muted-foreground">
        Use tokens like <code>{{`{{first_name}}`}}</code>, <code>{{`{{company}}`}}</code>, <code>{{`{{sender_name}}`}}</code>.
      </div>
    </div>
  );
}

