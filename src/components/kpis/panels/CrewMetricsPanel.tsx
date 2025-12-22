/**
 * Panel 4: Crew Metrics (Performance KPIs)
 */

'use client'

interface CrewMetric {
  crew_name: string
  jobs_completed: number
  avg_duration_days: number | null
  issue_rate: number
  documentation_score: number
  homeowner_rating: number
  scorecard_score: number
  on_time_arrival_rate: number
}

export default function CrewMetricsPanel({ crews }: { crews: CrewMetric[] }) {
  if (!crews || crews.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Crew Metrics</h2>
        <p className="text-gray-500">No crew data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Crew Metrics</h2>
      
      <div className="space-y-4">
        {crews.map((crew) => (
          <div key={crew.crew_name} className="border-b last:border-b-0 pb-4 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{crew.crew_name}</h3>
              <div className="text-sm font-bold text-blue-600">
                Scorecard: {crew.scorecard_score}/100
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">Jobs Completed</div>
                <div className="font-medium">{crew.jobs_completed}</div>
              </div>
              {crew.avg_duration_days && (
                <div>
                  <div className="text-xs text-gray-500">Avg Duration</div>
                  <div className="font-medium">{crew.avg_duration_days.toFixed(1)} days</div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-500">Issue Rate</div>
                <div className={`font-medium ${crew.issue_rate > 15 ? 'text-red-600' : 'text-green-600'}`}>
                  {crew.issue_rate}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Rating</div>
                <div className="font-medium">{crew.homeowner_rating.toFixed(1)}/5</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}






































