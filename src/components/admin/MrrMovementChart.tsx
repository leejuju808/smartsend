'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Row = { kind: string; amount: number; count: number }

export default function MrrMovementChart({ rows }: { rows: Row[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="kind" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="amount" name="USD MRR" />
          <Bar dataKey="count" name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
