'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface TrendData {
  day: string;
  app: string;
  events: number;
}

interface HQTrendProps {
  data: TrendData[];
}

export default function HQTrend({ data }: HQTrendProps) {
  // Group data by day and app
  const grouped: Record<string, Record<string, number>> = {};
  
  data.forEach(item => {
    if (!grouped[item.day]) {
      grouped[item.day] = {};
    }
    grouped[item.day][item.app] = item.events;
  });

  // Convert to array format
  const chartData = Object.entries(grouped).map(([day, apps]) => ({
    day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    smartsend: apps.smartsend || 0,
    opsgrid: apps.opsgrid || 0,
    agentcloud: apps.agentcloud || 0,
  }));

  return (
    <div className="border rounded-2xl p-6 bg-white">
      <h3 className="text-sm mb-4 opacity-80 font-semibold">Activity — Last 30 Days</h3>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="day" 
              tick={{ fontSize: 12 }}
              stroke="#888"
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              stroke="#888"
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="smartsend" 
              name="SmartSend" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="opsgrid" 
              name="OpsGrid" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="agentcloud" 
              name="AgentCloud" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-gray-400">
          No activity data yet
        </div>
      )}
    </div>
  );
}

