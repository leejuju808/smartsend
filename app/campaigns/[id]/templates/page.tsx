import { listVersions } from "@/lib/data/templates";
import { variantAnalytics } from "@/lib/data/variant-analytics";
import { createTemplateVersion, activateVersion } from "./actions";
import { upsertSplit, clearSplit, setAutopromote } from "./split-actions";
import { cloneFromActive } from "./edit-actions";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { variant?: string; days?: string };
}) {
  const campaignId = params.id as string;
  const variant = (searchParams?.variant ?? "default") as string;
  const period = Number(searchParams?.days ?? 14);

  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const [{ versions, activeId }, stats, splitRows, camp] = await Promise.all([
    listVersions(campaignId, variant),
    variantAnalytics(campaignId, period),
    sb
      .from("variant_split")
      .select("template_version_id, weight")
      .eq("campaign_id", campaignId)
      .eq("variant_key", variant),
    sb
      .from("campaigns")
      .select("ab_autopromote, ab_min_samples, ab_promotion_delta")
      .eq("id", campaignId)
      .maybeSingle(),
  ]);

  const rows = stats.filter(
    (s) => (s.variant_key ?? "default") === variant
  );

  const totalWeight = splitRows.data?.reduce((sum, r) => sum + r.weight, 0) ?? 0;

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Templates — {variant}</h1>
        <a
          href={`/campaigns/${campaignId}`}
          className="text-sm underline underline-offset-2"
        >
          Back to Campaign
        </a>
      </header>

      {/* Variant selector */}
      <section className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-2">Variant</div>
        <div className="flex gap-2">
          {["default", "A", "B"].map((v) => (
            <a
              key={v}
              href={`?variant=${v}`}
              className={`rounded-xl border px-3 py-1.5 text-xs ${
                variant === v ? "bg-black text-white" : ""
              }`}
            >
              {v}
            </a>
          ))}
        </div>
      </section>

      {/* Period selector */}
      <section className="rounded-2xl border p-4">
        <div className="text-sm font-medium mb-2">Time Period</div>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <a
              key={d}
              href={`?variant=${variant}&days=${d}`}
              className={`rounded-xl border px-3 py-1.5 text-xs ${
                period === d ? "bg-black text-white" : ""
              }`}
            >
              {d} days
            </a>
          ))}
        </div>
      </section>

      {/* Analytics table */}
      <section className="rounded-2xl border p-4">
        <div className="text-sm opacity-70 mb-2">Last {period} days</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="[&>th]:px-3 [&>th]:py-2 border-b">
              <th>Version</th>
              <th>Sent</th>
              <th>Replies</th>
              <th>Reply %</th>
              <th>Bounces+Complaints</th>
              <th>Fail %</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.template_version_id ?? "none"}`}
                className="border-b"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {r.version_label ?? "n/a"}
                    </span>
                    {activeId && r.template_version_id === activeId && (
                      <span className="px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide">
                        active
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">{r.sent}</td>
                <td className="px-3 py-2">{r.replies}</td>
                <td className="px-3 py-2">
                  {(r.replyRate * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2">{r.bounces + r.complaints}</td>
                <td className="px-3 py-2">
                  {(r.failRate * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {r.template_version_id && (
                      <>
                        <a href={`/campaigns/${campaignId}/templates/editor/${r.template_version_id}`} className="rounded-xl border px-3 py-1.5 text-xs mr-2">Edit</a>
                        {activeId && (
                          <a href={`/campaigns/${campaignId}/templates/diff?variant=${variant}&from=${activeId}&to=${r.template_version_id}`} className="rounded-xl border px-3 py-1.5 text-xs">Diff vs Active</a>
                        )}
                      </>
                    )}
                    {r.template_version_id &&
                      r.template_version_id !== activeId && (
                        <form action={activateVersion} className="inline">
                          <input
                            type="hidden"
                            name="campaignId"
                            value={campaignId}
                          />
                          <input type="hidden" name="variant" value={variant} />
                          <input
                            type="hidden"
                            name="versionId"
                            value={r.template_version_id!}
                          />
                          <button className="rounded-xl border px-3 py-1.5 text-xs">
                            Make Active
                          </button>
                        </form>
                      )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  className="px-3 py-6 text-center opacity-60"
                  colSpan={7}
                >
                  No data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Versions list */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Versions</h2>
        <div className="space-y-2">
          {versions.map((v: any) => (
            <div
              key={v.id}
              className="flex items-center justify-between p-3 rounded-xl border"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{v.version_label}</span>
                {v.id === activeId && (
                  <span className="px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide">
                    active
                  </span>
                )}
                <span className="text-xs opacity-60">
                  {new Date(v.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/campaigns/${campaignId}/templates/editor/${v.id}`} className="rounded-xl border px-3 py-1.5 text-xs mr-2">Edit</a>
                {activeId && (
                  <a href={`/campaigns/${campaignId}/templates/diff?variant=${variant}&from=${activeId}&to=${v.id}`} className="rounded-xl border px-3 py-1.5 text-xs">Diff vs Active</a>
                )}
                {v.id !== activeId && (
                  <form action={activateVersion} className="inline">
                    <input type="hidden" name="campaignId" value={campaignId} />
                    <input type="hidden" name="variant" value={variant} />
                    <input type="hidden" name="versionId" value={v.id} />
                    <button className="rounded-xl border px-3 py-1.5 text-xs">
                      Make Active
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="text-sm opacity-60 py-4 text-center">
              No versions yet
            </div>
          )}
        </div>
      </section>

      {/* Traffic Split Editor */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Traffic Split — {variant}</h2>
        <p className="text-sm opacity-70">
          Distribute new sends across versions. When no split exists, we use the
          active version.
        </p>

        {totalWeight !== 100 && totalWeight > 0 && (
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800">
            ⚠️ Weights sum to {totalWeight}% (should be 100%)
          </div>
        )}

        <div className="grid gap-2">
          {versions.map((v: any) => {
            const w =
              splitRows.data?.find((s) => s.template_version_id === v.id)
                ?.weight ?? 0;
            return (
              <form
                key={v.id}
                action={upsertSplit}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="campaignId" value={campaignId} />
                <input type="hidden" name="variant" value={variant} />
                <input type="hidden" name="versionId" value={v.id} />
                <div className="w-48 truncate">{v.version_label}</div>
                <input
                  name="weight"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={w}
                  className="rounded-xl border px-2 py-1 text-sm w-20"
                />
                <span className="text-xs opacity-60">%</span>
                <button className="rounded-xl border px-3 py-1.5 text-xs">
                  Save
                </button>
              </form>
            );
          })}
        </div>

        {splitRows.data && splitRows.data.length > 0 && (
          <form action={clearSplit}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="variant" value={variant} />
            <button className="rounded-xl border px-3 py-2 text-sm mt-2">
              Clear Split (use Active)
            </button>
          </form>
        )}

        <div className="mt-4 rounded-xl border p-3">
          <form action={setAutopromote} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="campaignId" value={campaignId} />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={!!camp?.data?.ab_autopromote}
              />
              Auto-promote winner
            </label>
            <label>
              Min samples per version
              <input
                name="minSamples"
                type="number"
                min="20"
                defaultValue={camp?.data?.ab_min_samples ?? 100}
                className="ml-2 w-24 rounded-xl border px-2 py-1"
              />
            </label>
            <label>
              Min reply% delta
              <input
                name="delta"
                type="number"
                step="0.001"
                defaultValue={camp?.data?.ab_promotion_delta ?? 0.02}
                className="ml-2 w-24 rounded-xl border px-2 py-1"
              />
            </label>
            <button className="rounded-xl border px-3 py-1.5">Save</button>
          </form>
          <p className="text-xs opacity-60 mt-2">
            When enabled, the system promotes the higher reply-rate version once
            both meet the sample size and the delta threshold.
          </p>
        </div>
      </section>

      {/* New version form */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-medium">Create Version</h2>
        <form action={cloneFromActive} className="flex items-center gap-2 mb-4">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="variant" value={variant} />
          <input name="label" placeholder="Label (e.g., v3-challenge)" className="rounded-xl border px-3 py-2 text-sm" />
          <button className="rounded-xl border px-3 py-2 text-sm">Clone from Active</button>
        </form>
        <form action={createTemplateVersion} className="grid gap-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="variant" value={variant} />
          <input
            name="label"
            placeholder="Version label"
            className="rounded-xl border px-3 py-2 text-sm"
            required
          />
          <input
            name="subject"
            placeholder="Subject"
            className="rounded-xl border px-3 py-2 text-sm"
            required
          />
          <textarea
            name="body_md"
            placeholder="Body (Markdown)"
            className="rounded-xl border px-3 py-2 text-sm h-40"
            required
          />
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" name="makeActive" /> Make active now
          </label>
          <button className="rounded-xl border px-3 py-2 text-sm w-fit">
            Save Version
          </button>
        </form>
      </section>
    </main>
  );
}
