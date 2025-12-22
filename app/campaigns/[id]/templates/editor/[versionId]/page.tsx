import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { mdToHtml } from "@/lib/ui/md";
import { updateVersion, quickPromote } from "../../edit-actions";

export default async function EditorPage({ params }: any) {
  const campaignId = params.id as string;
  const versionId  = params.versionId as string;
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies });
  const { data: v } = await sb.from("template_versions").select("id, campaign_id, variant_key, version_label, subject, body_md, is_active").eq("id", versionId).maybeSingle();

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Version — {v?.version_label}</h1>
        <a href={`/campaigns/${campaignId}/templates?variant=${v?.variant_key}`} className="text-sm underline underline-offset-2">Back</a>
      </header>

      <section className="rounded-2xl border p-4 space-y-3">
        <form action={updateVersion} className="grid grid-cols-2 gap-4">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="versionId" value={versionId} />
          <div className="space-y-2">
            <label className="text-sm">Subject</label>
            <input name="subject" defaultValue={v?.subject ?? ""} className="w-full rounded-xl border px-3 py-2 text-sm" />
            <label className="text-sm">Body (Markdown)</label>
            <textarea name="body_md" defaultValue={v?.body_md ?? ""} className="w-full h-[420px] rounded-xl border px-3 py-2 text-sm font-mono" />
            <div className="flex gap-2">
              <button className="rounded-xl border px-3 py-2 text-sm w-fit">Save</button>
            </div>
          </div>
          <div className="rounded-xl border p-3 overflow-auto h-[520px]">
            <div className="text-sm opacity-70 mb-2">Preview</div>
            {/* Server preview at load; client won't live update without JS — OK for MVP */}
            <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: mdToHtml(v?.body_md ?? "") }} />
            <div className="mt-4 text-xs opacity-60">Tip: save to refresh preview.</div>
            <form action={quickPromote} className="mt-4">
              <input type="hidden" name="campaignId" value={campaignId} />
              <input type="hidden" name="variant" value={v?.variant_key ?? "default"} />
              <input type="hidden" name="versionId" value={versionId} />
              {!v?.is_active && <button className="rounded-xl border px-3 py-2 text-sm">Make Active</button>}
            </form>
          </div>
        </form>
      </section>
    </main>
  );
}

