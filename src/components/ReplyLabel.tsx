import { Badge } from "@/components/ui/badge";

const variantMap: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  positive: "default",
  meeting_intent: "default",
  neutral: "secondary",
  oos: "outline",
  bounce: "destructive",
  ooo: "outline",
};

export function ReplyLabel({ label }: { label?: string | null }) {
  if (!label) return null;
  const variant = variantMap[label] ?? "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

