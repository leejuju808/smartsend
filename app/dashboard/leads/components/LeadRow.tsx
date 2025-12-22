import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/Badge";

export function LeadRow({
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
  const conversionScore = lead.conversion_score ?? 0;
  const pipelineStage = lead.pipeline_stage ?? "new";
  const lastSignal = lead.last_signal;

  // Pipeline stage badge colors
  const getPipelineStageColor = (stage: string) => {
    switch (stage) {
      case "new":
        return "secondary";
      case "engaged":
        return "default";
      case "interested":
        return "default";
      case "qualified":
        return "default";
      case "meeting_booked":
        return "default";
      case "dead":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <tr className="hover:bg-muted/40">
      <td className="py-2">
        <Link
          href={`/campaigns/${campaignId}/lead/${lead.id}`}
          className="underline underline-offset-2"
        >
          {lead.email}
        </Link>
      </td>
      <td className="py-2 opacity-70">{lead.first_name}</td>
      <td className="py-2 opacity-70">{lead.company}</td>
      <td className="py-2 opacity-70">{lead.title}</td>
      <td className="py-2">
        <div className="flex flex-col gap-1 min-w-[120px]">
          <span className="text-xs text-muted-foreground">Score</span>
          <Progress value={conversionScore} max={100} />
          <span className="text-xs font-medium">{conversionScore}/100</span>
        </div>
      </td>
      <td className="py-2">
        <Badge variant={getPipelineStageColor(pipelineStage) as any}>
          {pipelineStage}
        </Badge>
      </td>
      {lastSignal?.at && (
        <td className="py-2 text-xs opacity-70">
          <div>{lastSignal.type}</div>
          <div className="text-[10px]">
            {new Date(lastSignal.at).toLocaleDateString()}
          </div>
        </td>
      )}
    </tr>
  );
}

