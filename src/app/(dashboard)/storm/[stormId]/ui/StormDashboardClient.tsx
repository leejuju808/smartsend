'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StormDashboardClientProps {
  stormId: string;
  teamId: string;
  initialData: any;
  storm: any;
}

export default function StormDashboardClient({
  stormId,
  teamId,
  initialData,
  storm
}: StormDashboardClientProps) {
  const [stats, setStats] = useState(initialData?.stats || {});
  const [loading, setLoading] = useState(false);

  // Refresh stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/storm/${stormId}/dashboard?teamId=${teamId}`);
        const data = await res.json();
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error('Error refreshing dashboard:', error);
      } finally {
        setLoading(false);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [stormId, teamId]);

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Homes Impacted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.homes_impacted || 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.red_zone_homes || 0} red zone • {stats.yellow_zone_homes || 0} yellow zone
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Past Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.past_customers_count || 0}</div>
            <p className="text-xs text-gray-500 mt-1">In affected area</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">New Storm Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.new_storm_leads_count || 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              {stats.past_prospects_count || 0} past prospects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Damage Probability</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.predicted_damage_probability_avg
                ? Math.round(stats.predicted_damage_probability_avg * 100)
                : 0}%
            </div>
            <p className="text-xs text-gray-500 mt-1">Average probability</p>
          </CardContent>
        </Card>
      </div>

      {/* Outreach & Response */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Outreach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Messages Sent</span>
              <span className="text-2xl font-bold">{stats.outreach_sent_count || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Responses</span>
              <span className="text-2xl font-bold">{stats.outreach_response_count || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Response Rate</span>
              <span className="text-2xl font-bold">
                {stats.outreach_response_rate
                  ? `${Math.round(stats.outreach_response_rate)}%`
                  : '0%'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inspections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Scheduled</span>
              <span className="text-2xl font-bold">{stats.inspections_scheduled || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Completed</span>
              <span className="text-2xl font-bold">{stats.inspections_completed || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Jobs Sold</span>
              <span className="text-2xl font-bold text-green-400">
                {stats.jobs_sold || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zone Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Damage Probability Zones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="text-3xl font-bold text-red-400">
                {stats.red_zone_homes || 0}
              </div>
              <div className="text-sm text-gray-400 mt-1">Red Zone</div>
              <div className="text-xs text-gray-500">70-100% probability</div>
            </div>
            <div className="text-center p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <div className="text-3xl font-bold text-yellow-400">
                {stats.yellow_zone_homes || 0}
              </div>
              <div className="text-sm text-gray-400 mt-1">Yellow Zone</div>
              <div className="text-xs text-gray-500">40-69% probability</div>
            </div>
            <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/20">
              <div className="text-3xl font-bold text-green-400">
                {stats.green_zone_homes || 0}
              </div>
              <div className="text-sm text-gray-400 mt-1">Green Zone</div>
              <div className="text-xs text-gray-500">&lt;40% probability</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crew Deployment */}
      <Card>
        <CardHeader>
          <CardTitle>Crew Deployment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-400">Crews Deployed</div>
              <div className="text-2xl font-bold mt-1">{stats.crews_deployed || 0}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Routes Assigned</div>
              <div className="text-2xl font-bold mt-1">{stats.routes_assigned || 0}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Routes Completed</div>
              <div className="text-2xl font-bold mt-1 text-green-400">
                {stats.routes_completed || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue */}
      {stats.jobs_sold > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400">
              ${stats.jobs_estimated_value_total
                ? stats.jobs_estimated_value_total.toLocaleString()
                : '0'}
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Estimated value from {stats.jobs_sold} jobs
            </p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="fixed bottom-4 right-4 bg-gray-800 px-4 py-2 rounded-lg shadow-lg">
          <span className="text-sm text-gray-400">Updating...</span>
        </div>
      )}
    </div>
  );
}






















