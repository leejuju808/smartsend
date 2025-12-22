"use client";

import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

function EventBadges({ emailId }: { emailId: string }) {
  const { data } = useQuery({
    queryKey: ["email-events", emailId],
    queryFn: async () => {
      const res = await fetch(`/api/events?emailId=${emailId}`);
      return res.json() as Promise<{ opened: number; clicked: number }>;
    }
  });

  if (!data) return null;

  return (
    <div className="flex items-center gap-2">
      {data.opened > 0 && <Badge className="bg-amber-500 text-black">{data.opened} Open{data.opened>1?"s":""}</Badge>}
      {data.clicked > 0 && <Badge className="bg-blue-500 text-white">{data.clicked} Click{data.clicked>1?"s":""}</Badge>}
    </div>
  );
}

export default EventBadges;

