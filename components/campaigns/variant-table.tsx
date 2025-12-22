"use client";

interface VariantStat {
  variant_id: string;
  name: string;
  weight: number;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  meeting_intent: number;
  reply_rate: number;
  meeting_rate: number;
  score: number;
}

interface VariantTableProps {
  variants: VariantStat[];
}

export function VariantTable({ variants }: VariantTableProps) {
  if (!variants || variants.length === 0) {
    return (
      <div className="text-sm text-gray-500 p-4">
        No variant data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left py-3 px-4 font-semibold">Variant</th>
            <th className="text-center py-3 px-4 font-semibold">Weight</th>
            <th className="text-center py-3 px-4 font-semibold">Sent</th>
            <th className="text-center py-3 px-4 font-semibold">Opens</th>
            <th className="text-center py-3 px-4 font-semibold">Clicks</th>
            <th className="text-center py-3 px-4 font-semibold">Replies</th>
            <th className="text-center py-3 px-4 font-semibold">Meetings</th>
            <th className="text-center py-3 px-4 font-semibold">Score</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.variant_id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4 font-medium">{v.name}</td>
              <td className="text-center py-3 px-4">
                {(v.weight * 100).toFixed(0)}%
              </td>
              <td className="text-center py-3 px-4">{v.sent}</td>
              <td className="text-center py-3 px-4">{v.opens}</td>
              <td className="text-center py-3 px-4">{v.clicks}</td>
              <td className="text-center py-3 px-4">{v.replies}</td>
              <td className="text-center py-3 px-4">{v.meeting_intent}</td>
              <td className="text-center py-3 px-4 font-bold text-blue-600">
                {v.score.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}










