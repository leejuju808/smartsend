import { Badge } from "@/components/ui/badge";

export function ThreadHeader({ subject, replied }: { subject: string; replied?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{subject}</h2>
      {replied && <Badge variant="secondary">Replied</Badge>}
    </div>
  );
}

