'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Row = { variant: string; started: number; activated: number; conv: number }

export default function ExperimentsVariantChart({ rows }: { rows: Row[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="variant" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="started" name="Checkouts" fill="#60a5fa" />
          <Bar dataKey="activated" name="Activations" fill="#34d399" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

