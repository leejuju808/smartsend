"use client";

import { Heatmap } from "./heatmap";

interface DowData {
  dow: number;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
}

interface CampaignDowHeatmapProps {
  data: DowData[];
}

const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CampaignDowHeatmap({ data }: CampaignDowHeatmapProps) {
  const merged = labels.map((_, i) => {
    const found = data.find((d) => d.dow === i);
    return {
      dow: i,
      value: found ? found.opens + found.clicks + found.replies : 0,
      sends: found?.sends || 0,
      opens: found?.opens || 0,
      clicks: found?.clicks || 0,
      replies: found?.replies || 0,
    };
  });

  return (
    <div className="p-4">
      <h3 className="font-semibold mb-2">Engagement by Day</h3>
      <div className="grid grid-cols-7 gap-1 text-[10px] mb-2">
        {labels.map((l, i) => (
          <div key={i} className="text-center opacity-50">
            {l}
          </div>
        ))}
      </div>
      <Heatmap
        data={merged}
        rows={1}
        cols={7}
        getValue={(d) => d.value}
        getTooltip={(d) => 
          `${labels[d.dow]}: ${d.opens} opens, ${d.clicks} clicks, ${d.replies} replies (${d.value} total)`
        }
      />
      <div className="mt-2 text-xs text-muted-foreground">
        Hover over squares to see engagement details
      </div>
    </div>
  );
}

