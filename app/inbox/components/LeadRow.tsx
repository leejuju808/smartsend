import Link from "next/link";
import { getPausedState } from "../../../lib/data/inbox-paused";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/Badge";

export async function LeadRow({
  campaignId,
  lead,
}: {
  campaignId: string;
  lead: {
    id: string;
    email: string;
    first_name?: string | null;
    company?: string | null;
    title?: string | null;
    conversion_score?: number | null;
    pipeline_stage?: string | null;
    last_signal?: {
      type?: string;
      at?: string;
    } | null;
  };
}) {
  const paused = await getPausedState(campaignId, lead.id);

  function Chip({
    label,
    tone,
    title,
  }: {
    label: string;
    tone: "red" | "amber";
    title: string;
  }) {
    const base = "px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide";
    const cls =
      tone === "red"
        ? "border-red-600 text-red-700"
        : "border-amber-500 text-amber-700";
    return (
      <span className={`${base} ${cls}`} title={title}>
        {label}
      </span>
    );
  }

  return (
    <tr className="hover:bg-muted/40">
      <td className="py-2">
        <Link
          href={`/campaigns/${campaignId}/lead/${lead.id}`}
          className="underline underline-offset-2"
        >
          {lead.email}
        </Link>
        <div className="mt-1 flex gap-2">
          {paused.campaign.isPaused && (
            <Chip
              label="Campaign paused"
              tone="red"
              title={`Reason: ${paused.campaign.reason ?? "paused"}`}
            />
          )}
          {paused.lead.isPaused && (
            <Chip
              label="Lead paused"
              tone="amber"
              title={`Reason: ${paused.lead.reason ?? "paused"}`}
            />
          )}
        </div>
      </td>
      <td className="py-2 opacity-70">{lead.first_name}</td>
      <td className="py-2 opacity-70">{lead.company}</td>
      <td className="py-2 opacity-70">{lead.title}</td>
      <td className="py-2">
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className="text-xs text-muted-foreground">Score</span>
          <Progress value={lead.conversion_score ?? 0} max={100} />
          <span className="text-xs font-medium">{lead.conversion_score ?? 0}/100</span>
        </div>
      </td>
      <td className="py-2">
        <Badge variant="outline">{lead.pipeline_stage ?? "new"}</Badge>
      </td>
    </tr>
  );
}
