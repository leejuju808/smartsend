"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"

export function EmailChart({ data }: { data: { day: string; sent: number; opened: number; clicked: number }[] }) {
  return (
    <div className="p-4 rounded-2xl border">
      <div className="text-sm font-medium mb-2">14-day Engagement</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="sent" stroke="#8884d8" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="opened" stroke="#82ca9d" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="clicked" stroke="#ffc658" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

