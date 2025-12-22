"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function PipelineBoard() {
  const [columns, setColumns] = useState<any>({});

  useEffect(() => {
    fetch("/api/pipeline")
      .then(r => r.json())
      .then(j => setColumns(j.pipeline || {}));
  }, []);

  const statuses = ["Interested", "Follow Up", "Not Interested", "Out of Office", "Unclear", "Uncategorized"];

  return (
    <div className="overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">📈 Lead Pipeline</h3>
      <div className="flex gap-4 min-w-[1200px]">
        {statuses.map(status => (
          <div key={status} className="flex-1 min-w-[250px]">
            <div className="font-semibold text-center mb-2 bg-zinc-100 p-2 rounded">
              {status} ({columns[status]?.length || 0})
            </div>
            <div className="space-y-2">
              {(columns[status] || []).map((lead: any) => (
                <Card key={lead.reply_id} className="shadow-sm border border-zinc-200">
                  <CardContent className="p-2 text-sm">
                    <div className="font-semibold">{lead.from_email}</div>
                    <div className="text-xs text-zinc-500">{lead.subject || "(no subject)"}</div>
                    <div className="text-xs mt-1 italic text-zinc-600">
                      {lead.sentiment} • {new Date(lead.received_at).toLocaleDateString()}
                    </div>
                    {lead.follow_up_required && (
                      <div className="text-xs text-yellow-700 font-semibold mt-1">Follow Up Needed</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}