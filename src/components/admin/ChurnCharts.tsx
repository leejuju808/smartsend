'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import React from 'react'

type DayAgg = { day: string; canceled: number; saved: number }
type Reason = { name: string; value: number }

export default function ChurnCharts({ series, reasons }: { series: DayAgg[]; reasons: Reason[] }) {
  return (
    <div className="space-y-6">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="canceled" strokeWidth={2} name="Canceled" />
            <Line type="monotone" dataKey="saved" strokeWidth={2} name="Saves" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            <Pie data={reasons} dataKey="value" nameKey="name" outerRadius={90} label>
              {reasons.map((_, i) => <Cell key={i} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

'use client'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import React from 'react'

type DayAgg = { day: string; canceled: number; saved: number }
type Reason = { name: string; value: number }

export default function ChurnCharts({ series, reasons }: { series: DayAgg[]; reasons: Reason[] }) {
  return (
    <div className="space-y-6">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="canceled" strokeWidth={2} name="Canceled" />
            <Line type="monotone" dataKey="saved" strokeWidth={2} name="Saves" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            <Pie data={reasons} dataKey="value" nameKey="name" outerRadius={90} label>
              {reasons.map((_, i) => <Cell key={i} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
