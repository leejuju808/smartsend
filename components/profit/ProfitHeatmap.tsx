// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Profit Heatmap Component
// Shows which crews produce good profit, run over budget, or underperform

"use client";

interface HeatmapData {
  crew: string;
  avg_profit: number;
  avg_margin: number;
  job_count: number;
}

export function ProfitHeatmap({ heatmap }: { heatmap: HeatmapData[] }) {
  if (heatmap.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          Profit Heatmap by Crew
        </h2>
        <div className="text-sm text-zinc-400">No crew performance data yet.</div>
      </div>
    );
  }

  const getPerformanceColor = (margin: number, profit: number) => {
    if (margin >= 40 && profit >= 5000) return "bg-emerald-500";
    if (margin >= 35 && profit >= 3000) return "bg-green-500";
    if (margin >= 30 && profit >= 1000) return "bg-amber-500";
    if (margin >= 25) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getPerformanceLabel = (margin: number, profit: number) => {
    if (margin >= 40 && profit >= 5000) return "Excellent";
    if (margin >= 35 && profit >= 3000) return "Good";
    if (margin >= 30 && profit >= 1000) return "Solid";
    if (margin >= 25) return "Needs Improvement";
    return "Underperforming";
  };

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-4">
        Profit Heatmap by Crew
      </h2>
      <p className="text-sm text-zinc-400 mb-6">
        Shows which crews produce good profit, run over budget, or underperform
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {heatmap.map((crew, idx) => {
          const performanceColor = getPerformanceColor(crew.avg_margin, crew.avg_profit);
          const performanceLabel = getPerformanceLabel(crew.avg_margin, crew.avg_profit);

          return (
            <div
              key={idx}
              className={`${performanceColor} bg-opacity-10 border-2 ${performanceColor.replace("bg-", "border-")} rounded-lg p-4`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-zinc-100">{crew.crew}</h3>
                <span className={`text-xs px-2 py-1 rounded ${
                  performanceColor.replace("bg-", "bg-").replace("-500", "-900")
                } text-zinc-200`}>
                  {performanceLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-zinc-400 mb-1">Avg Profit</div>
                  <div className={`font-semibold ${
                    crew.avg_profit >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    ${Math.round(crew.avg_profit).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400 mb-1">Avg Margin</div>
                  <div className={`font-semibold ${
                    crew.avg_margin >= 35 ? "text-emerald-400" :
                    crew.avg_margin >= 30 ? "text-amber-400" :
                    "text-red-400"
                  }`}>
                    {crew.avg_margin.toFixed(1)}%
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-zinc-400 mb-1">Jobs Completed</div>
                  <div className="text-zinc-200 font-medium">
                    {crew.job_count} {crew.job_count === 1 ? "job" : "jobs"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}





























