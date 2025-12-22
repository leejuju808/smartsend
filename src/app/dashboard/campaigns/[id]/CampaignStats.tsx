"use client";

interface CampaignStatsProps {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  replied: number;
  status: string;
  opens?: number;
  clicks?: number;
  uniqueOpens?: number;
  uniqueClicks?: number;
}

export default function CampaignStats({
  total,
  sent,
  failed,
  pending,
  replied,
  status,
  opens = 0,
  clicks = 0,
  uniqueOpens = 0,
  uniqueClicks = 0,
}: CampaignStatsProps) {
  const sentPercentage = total > 0 ? Math.round((sent / total) * 100) : 0;
  const repliedPercentage = sent > 0 ? Math.round((replied / sent) * 100) : 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Campaign Statistics</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{sent}</div>
          <div className="text-sm text-gray-600">Sent</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{failed}</div>
          <div className="text-sm text-gray-600">Failed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{pending}</div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{replied}</div>
          <div className="text-sm text-gray-600">Replied</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{uniqueOpens}</div>
          <div className="text-sm text-gray-600">Opens</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-indigo-600">{uniqueClicks}</div>
          <div className="text-sm text-gray-600">Clicks</div>
        </div>
      </div>

      {/* Progress Bar */}
      {status === 'running' && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progress</span>
            <span>{sentPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${sentPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Reply Rate */}
      {sent > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Reply Rate</span>
            <span>{repliedPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${repliedPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Open Rate */}
      {sent > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Open Rate</span>
            <span>{Math.round((uniqueOpens / sent) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((uniqueOpens / sent) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Click Rate */}
      {sent > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Click Rate</span>
            <span>{Math.round((uniqueClicks / sent) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((uniqueClicks / sent) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Status-specific info */}
      {status === 'draft' && (
        <div className="text-center py-4 bg-gray-50 rounded-lg">
          <p className="text-gray-600">Campaign is in draft mode. Queue contacts and start sending.</p>
        </div>
      )}
      
      {status === 'running' && (
        <div className="text-center py-4 bg-green-50 rounded-lg">
          <p className="text-green-800">Campaign is actively sending emails.</p>
        </div>
      )}
      
      {status === 'paused' && (
        <div className="text-center py-4 bg-yellow-50 rounded-lg">
          <p className="text-yellow-800">Campaign is paused. You can resume at any time.</p>
        </div>
      )}
      
      {status === 'done' && (
        <div className="text-center py-4 bg-blue-50 rounded-lg">
          <p className="text-blue-800">Campaign completed successfully!</p>
        </div>
      )}
    </div>
  );
} 