"use client";

// Block 28060 — Referral Stats Component

interface ReferralStatsProps {
  stats: {
    total: number;
    booked: number;
    closed: number;
    conversionRate: number;
  };
}

export function ReferralStats({ stats }: ReferralStatsProps) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold mb-4">Referral Performance</h2>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Total Referrals</span>
            <span className="font-semibold">{stats.total}</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Booked</span>
            <span className="font-semibold">{stats.booked}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: stats.total > 0 ? `${(stats.booked / stats.total) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Closed</span>
            <span className="font-semibold">{stats.closed}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: stats.total > 0 ? `${(stats.closed / stats.total) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <div className="pt-4 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Conversion Rate</span>
            <span className="text-lg font-bold text-green-600">
              {stats.conversionRate}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


































