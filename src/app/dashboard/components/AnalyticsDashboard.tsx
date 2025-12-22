"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function AnalyticsDashboard() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/metrics").then(r=>r.json()).then(j=>setData(j.metrics || []));
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">📊 Campaign Analytics</h3>
      {data.map(seq => (
        <Card key={seq.sequence_id} className="border p-3">
          <CardContent>
            <h4 className="font-semibold mb-2">{seq.name}</h4>
            <div className="text-sm mb-2">
              Sent: {seq.sent} | Opened: {seq.opened} | Clicked: {seq.clicked} | Bounced: {seq.bounced}
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-xs">Open Rate {seq.open_rate}%</span>
                <Progress value={seq.open_rate} className="h-2" />
              </div>
              <div>
                <span className="text-xs">Click Rate {seq.click_rate}%</span>
                <Progress value={seq.click_rate} className="h-2" />
              </div>
              <div>
                <span className="text-xs">Bounce Rate {seq.bounce_rate}%</span>
                <Progress value={seq.bounce_rate} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && <p className="text-sm text-zinc-500">No analytics yet.</p>}
    </div>
  );
}