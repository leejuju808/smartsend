"use client";

import { Heatmap } from "./heatmap";

interface HourData {
  hour: number;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
}

interface CampaignHourHeatmapProps {
  data: HourData[];
}

export function CampaignHourHeatmap({ data }: CampaignHourHeatmapProps) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const merged = hours.map((h) => {
    const found = data.find((d) => d.hour === h);
    return {
      hour: h,
      value: found ? found.opens + found.clicks + found.replies : 0,
      sends: found?.sends || 0,
      opens: found?.opens || 0,
      clicks: found?.clicks || 0,
      replies: found?.replies || 0,
    };
  });

  return (
    <div className="p-4">
      <h3 className="font-semibold mb-2">Engagement by Hour</h3>
      <div className="grid gap-1 text-[10px] mb-2" style={{ gridTemplateColumns: "repeat(24, 1fr)" }}>
        {hours.map((h) => (
          <div key={h} className="text-center opacity-50">
            {h}
          </div>
        ))}
      </div>
      <Heatmap
        data={merged}
        rows={1}
        cols={24}
        getValue={(d) => d.value}
        getTooltip={(d) => 
          `Hour ${d.hour}: ${d.opens} opens, ${d.clicks} clicks, ${d.replies} replies (${d.value} total)`
        }
      />
      <div className="mt-2 text-xs text-muted-foreground">
        Hover over squares to see engagement details
      </div>
    </div>
  );
}

