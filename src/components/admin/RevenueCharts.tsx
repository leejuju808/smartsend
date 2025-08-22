'use client'
import React from 'react'
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

type DayAgg = { day: string; revenue_cents: number; charges: number }

export default function RevenueCharts({ series }: { series: DayAgg[] }) {
  const money = series.map((d) => ({ day: d.day, revenue: Math.round(d.revenue_cents / 100) }))
  return (
    <div className="space-y-6">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={money}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="revenue" name="Revenue (USD)" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="charges" name="Succeeded charges" stroke="#111827" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

