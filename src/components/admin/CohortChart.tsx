'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Row = { week: string; users: number; pro: number; avg7d: number }

export default function CohortChart({ rows }: { rows: Row[] }) {
  const data = rows.map(r => ({ week: r.week.slice(5), users: r.users, pro_pct: r.users ? Math.round((r.pro / r.users) * 1000) / 10 : 0, avg7d: r.avg7d }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis yAxisId="left" allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="users" name="Users" />
          <Bar yAxisId="right" dataKey="pro_pct" name="Pro %" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
