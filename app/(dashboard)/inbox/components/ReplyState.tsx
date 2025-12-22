// app/(dashboard)/inbox/components/ReplyState.tsx
import { Badge } from "@/components/ui/badge";

export function ReplyState({ replied }: { replied: boolean }) {
  return replied
    ? <Badge className="bg-green-600/80 text-white">Replied</Badge>
    : <Badge variant="outline">Awaiting</Badge>;
}















