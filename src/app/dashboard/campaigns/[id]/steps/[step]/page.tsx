import RewriteModal from "./RewriteModal";
import { supabaseAdmin } from "@/lib/supabase-admin";

function extractVariables(html: string) {
  const matches = html.match(/\{\{\s*([^}\s|]+)[^}]*\}\}/g) || [];
  const vars = new Set<string>();
  for (const m of matches) {
    const inner = m.replace(/\{\{|\}\}/g, "").trim();
    const base = inner.split("|")[0]?.trim();
    if (base) vars.add(base.replace(/^lead\./, ""));
  }
  return Array.from(vars);
}

export default async function StepPage({
  params,
}: {
  params: { id: string; step: string };
}) {
  const stepIndex = Number(params.step);

  const { data: step, error } = await supabaseAdmin
    .from("campaign_steps")
    .select("subject, body_html")
    .eq("campaign_id", params.id)
    .eq("step_index", stepIndex)
    .maybeSingle();

  const baseSubject = step?.subject || "";
  const baseBodyHtml = step?.body_html || "";
  const variables = extractVariables(baseBodyHtml);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Step {params.step}</h1>
        <RewriteModal
          campaignId={params.id}
          stepNo={stepIndex}
          baseSubject={baseSubject}
          baseBodyHtml={baseBodyHtml}
          variables={variables}
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load step: {error.message}
        </div>
      ) : null}

      {!step ? (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Step content not found. Add a template in the steps editor to enable AI rewrites.
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="rounded-xl border p-4">
            <div className="mb-2 text-xs text-muted-foreground">Current Subject</div>
            <div className="font-medium">{baseSubject || "(empty)"}</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-2 text-xs text-muted-foreground">Current Body</div>
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: baseBodyHtml || "<p>(empty)</p>" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}












