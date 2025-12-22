import { Badge } from "@/components/ui/badge";

export function ReplyBrainBadge({ 
  intent, 
  action, 
  confidence 
}: { 
  intent: string; 
  action: string; 
  confidence: number;
}) {
  const pct = Math.round(confidence * 100);
  
  const intentColors: Record<string, string> = {
    positive: "bg-green-100 text-green-800",
    negative: "bg-red-100 text-red-800",
    neutral: "bg-gray-100 text-gray-800",
    unsubscribe: "bg-orange-100 text-orange-800",
    spam: "bg-purple-100 text-purple-800",
    bounce: "bg-yellow-100 text-yellow-800",
    meeting_interest: "bg-blue-100 text-blue-800",
    out_of_office: "bg-cyan-100 text-cyan-800",
    question: "bg-indigo-100 text-indigo-800",
    none: "bg-slate-100 text-slate-800"
  };

  const actionColors: Record<string, string> = {
    auto_unsubscribe: "border-orange-300",
    mark_bounce: "border-yellow-300",
    schedule_meeting: "border-blue-300",
    send_followup_a: "border-green-300",
    send_followup_b: "border-green-300",
    route_to_human: "border-red-300",
    create_task: "border-purple-300",
    archive: "border-gray-300",
    ignore: "border-slate-300"
  };

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant="secondary" 
        className={intentColors[intent] || "bg-gray-100 text-gray-800"}
      >
        {intent.replace(/_/g, ' ')}
      </Badge>
      <Badge 
        variant="outline" 
        className={actionColors[action] || "border-gray-300"}
      >
        {action.replace(/_/g, ' ')}
      </Badge>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}















