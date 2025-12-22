"use client";

// Block 28060 — Review Stats Component

interface ReviewStatsProps {
  stats: {
    requested: number;
    clicked: number;
    completed: number;
    clickRate: number;
    completionRate: number;
  };
}

export function ReviewStats({ stats }: ReviewStatsProps) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold mb-4">Review Performance</h2>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Requested</span>
            <span className="font-semibold">{stats.requested}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Clicked</span>
            <span className="font-semibold">
              {stats.clicked} ({stats.clickRate}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${stats.clickRate}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Completed</span>
            <span className="font-semibold">
              {stats.completed} ({stats.completionRate}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


































