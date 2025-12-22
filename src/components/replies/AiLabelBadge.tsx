import { Badge } from "@/components/ui/badge";

const LABEL_MAP: Record<string, string> = {
  reply: "Reply (AI)",
  ooa: "OOO",
  spam: "Spam",
  forward: "Fwd",
  bounce: "Bounce",
};

export function AiLabelBadge({ label }: { label?: string | null }) {
  if (!label || label === "not-reply") return null;
  return (
    <Badge variant="outline" className="text-[11px]">
      {LABEL_MAP[label] ?? label}
    </Badge>
  );
}










