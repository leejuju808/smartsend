import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { lineDiff } from "@/lib/ui/diff";

export default async function DiffPage({ params, searchParams }: any) {
  const campaignId = params.id as string;
  const variant = (searchParams?.variant ?? "default") as string;
  const fromId = searchParams?.from as string;
  const toId   = searchParams?.to as string;

  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies });
  const { data: from } = await sb.from("template_versions").select("version_label,subject,body_md").eq("id", fromId).maybeSingle();
  const { data: to }   = await sb.from("template_versions").select("version_label,subject,body_md").eq("id", toId).maybeSingle();

  const subj = lineDiff(from?.subject ?? "", to?.subject ?? "");
  const body = lineDiff(from?.body_md ?? "", to?.body_md ?? "");

  function Chunk({ c }:{ c: any }) {
    const base = "px-2 py-0.5 rounded-md text-xs whitespace-pre-wrap";
    const cls = c.type==="add" ? "bg-emerald-100 dark:bg-emerald-900/30"
             : c.type==="del" ? "bg-red-100 dark:bg-red-900/30 line-through opacity-70"
             : "bg-transparent";
    return <div className={`${base} ${cls}`}>{c.text || " "}</div>;
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Diff — {variant}</h1>
        <a href={`/campaigns/${campaignId}/templates?variant=${variant}`} className="text-sm underline underline-offset-2">Back</a>
      </header>

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm opacity-70">Subject</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60 mb-2">{from?.version_label}</div>
            {subj.map((c,i)=><Chunk key={i} c={c} />)}
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs opacity-60 mb-2">{to?.version_label}</div>
            {subj.map((c,i)=><Chunk key={i} c={{...c, type: c.type==="del"?"add":c.type}} />)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm opacity-70">Body (Markdown)</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3 h-[520px] overflow-auto">
            <div className="text-xs opacity-60 mb-2">{from?.version_label}</div>
            {body.map((c,i)=><Chunk key={i} c={c} />)}
          </div>
          <div className="rounded-2xl border p-3 h-[520px] overflow-auto">
            <div className="text-xs opacity-60 mb-2">{to?.version_label}</div>
            {body.map((c,i)=><Chunk key={i} c={{...c, type: c.type==="del"?"add":c.type}} />)}
          </div>
        </div>
      </section>
    </main>
  );
}

