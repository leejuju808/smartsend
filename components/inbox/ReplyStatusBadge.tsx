"use client";

import { Badge } from "@/components/ui/badge";

type Props = {
  status?: string | null;
};

export function ReplyStatusBadge({ status }: Props) {
  const s = status || "new";

  if (s === "new") {
    return (
      <Badge className="bg-sky-900/80 border-sky-600 text-[9px]">
        New
      </Badge>
    );
  }

  if (s === "handling") {
    return (
      <Badge className="bg-amber-900/80 border-amber-600 text-[9px]">
        Handling
      </Badge>
    );
  }

  // done
  return (
    <Badge className="bg-emerald-900/80 border-emerald-600 text-[9px]">
      Done
    </Badge>
  );
}

