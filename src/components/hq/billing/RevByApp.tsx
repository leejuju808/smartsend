'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface RevByAppData {
  app: string;
  revenue_usd: number;
}

export default function RevByApp({ data }: { data: RevByAppData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue by App</CardTitle>
      </CardHeader>
      <CardContent>
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="app" 
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                formatter={(value: any) => `$${Number(value).toFixed(2)}`}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              />
              <Bar 
                dataKey="revenue_usd" 
                name="Revenue" 
                fill="#3b82f6"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-sm">No revenue data available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

