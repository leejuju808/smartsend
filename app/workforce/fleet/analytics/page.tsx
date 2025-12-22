"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Fuel, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

type AnalyticsData = {
  analytics: Array<{
    vehicle_id: string;
    vehicle_name: string;
    fuel_total: number;
    maintenance_total: number;
    repair_total: number;
    total_cost: number;
    miles_driven: number;
    cost_per_mile: number;
    cost_per_job: number;
    job_count: number;
  }>;
  totals: {
    fuel_total: number;
    maintenance_total: number;
    repair_total: number;
    total_cost: number;
    total_miles: number;
    avg_cost_per_mile: number;
  };
};

export default function FleetAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(
    new Date(new Date().setDate(1)).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    loadAnalytics();
  }, [startDate, endDate]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("start_date", startDate);
      params.append("end_date", endDate);

      const response = await fetch(`/api/fleet/analytics?${params}`);
      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No analytics data available</p>
      </div>
    );
  }

  const { analytics, totals } = data;

  // Prepare chart data
  const costByVehicle = analytics.map((v) => ({
    name: v.vehicle_name,
    fuel: v.fuel_total,
    maintenance: v.maintenance_total,
    repair: v.repair_total,
    total: v.total_cost,
  }));

  const costPerMile = analytics.map((v) => ({
    name: v.vehicle_name,
    "Cost/Mile": v.cost_per_mile > 0 ? v.cost_per_mile : 0,
  }));

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fleet Expense Analytics</h1>
          <p className="text-gray-600 mt-1">
            Track fuel, maintenance, and repair costs across your fleet
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {/* Totals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Fuel Cost</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totals.fuel_total)}
                </p>
              </div>
              <Fuel className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Maintenance</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totals.maintenance_total)}
                </p>
              </div>
              <Wrench className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Cost</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totals.total_cost)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Cost/Mile</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totals.avg_cost_per_mile)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cost by Vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costByVehicle}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="fuel" stackId="a" fill="#3b82f6" name="Fuel" />
                <Bar dataKey="maintenance" stackId="a" fill="#f97316" name="Maintenance" />
                <Bar dataKey="repair" stackId="a" fill="#ef4444" name="Repair" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Per Mile</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={costPerMile}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Line
                  type="monotone"
                  dataKey="Cost/Mile"
                  stroke="#10b981"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    Vehicle
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Fuel Cost
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Maintenance
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Total Cost
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Miles
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Cost/Mile
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Cost/Job
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    Jobs
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((vehicle) => (
                  <tr key={vehicle.vehicle_id} className="border-b border-gray-100">
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {vehicle.vehicle_name}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {formatCurrency(vehicle.fuel_total)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {formatCurrency(vehicle.maintenance_total)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900">
                      {formatCurrency(vehicle.total_cost)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {vehicle.miles_driven.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {formatCurrency(vehicle.cost_per_mile)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {formatCurrency(vehicle.cost_per_job)}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {vehicle.job_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
























