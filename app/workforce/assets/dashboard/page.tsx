"use client";

import { useEffect, useState } from "react";
import { Package, AlertTriangle, Wrench, MapPin, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

type DashboardSummary = {
  total_assets: number;
  available: number;
  assigned: number;
  in_maintenance: number;
  lost: number;
  damaged_open_reports: number;
  overdue_maintenance: number;
};

type LostAsset = {
  asset_id: string;
  asset_name: string;
  category: string;
  last_assigned_to: string;
  days_lost: number;
};

type MaintenanceDue = {
  asset_id: string;
  asset_name: string;
  category: string;
  maintenance_type: string;
  next_due: string;
  days_until_due: number;
};

type DamageReport = {
  id: string;
  asset: {
    name: string;
    category: string;
  };
  severity: string;
  description: string;
  reported_at: string;
};

export default function AssetsDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [lostAssets, setLostAssets] = useState<LostAsset[]>([]);
  const [maintenanceDue, setMaintenanceDue] = useState<MaintenanceDue[]>([]);
  const [recentDamage, setRecentDamage] = useState<DamageReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/workforce/assets/dashboard");
      const data = await response.json();
      setSummary(data.summary);
      setLostAssets(data.lost_assets || []);
      setMaintenanceDue(data.maintenance_due || []);
      setRecentDamage(data.recent_damage_reports || []);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Equipment Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Overview of all equipment, assignments, and maintenance
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Assets</p>
                <p className="text-2xl font-bold text-gray-900">
                  {summary?.total_assets || 0}
                </p>
              </div>
              <Package className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Available</p>
                <p className="text-2xl font-bold text-green-600">
                  {summary?.available || 0}
                </p>
              </div>
              <Package className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Use</p>
                <p className="text-2xl font-bold text-blue-600">
                  {summary?.assigned || 0}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Maintenance</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {summary?.in_maintenance || 0}
                </p>
              </div>
              <Wrench className="w-8 h-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lost Assets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Lost Equipment ({lostAssets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lostAssets.length === 0 ? (
              <p className="text-gray-500 text-sm">No lost equipment</p>
            ) : (
              <div className="space-y-3">
                {lostAssets.map((asset) => (
                  <div
                    key={asset.asset_id}
                    className="p-3 border border-red-200 rounded-lg bg-red-50"
                  >
                    <div className="font-medium text-gray-900">{asset.asset_name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Last assigned to: {asset.last_assigned_to} • {asset.days_lost} days
                      ago
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maintenance Due */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-yellow-500" />
              Maintenance Due ({maintenanceDue.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {maintenanceDue.length === 0 ? (
              <p className="text-gray-500 text-sm">No maintenance due</p>
            ) : (
              <div className="space-y-3">
                {maintenanceDue.map((item) => (
                  <div
                    key={item.asset_id}
                    className="p-3 border border-yellow-200 rounded-lg bg-yellow-50"
                  >
                    <div className="font-medium text-gray-900">{item.asset_name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {item.maintenance_type} • Due in {item.days_until_due} days
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Damage Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Damage Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDamage.length === 0 ? (
            <p className="text-gray-500 text-sm">No recent damage reports</p>
          ) : (
            <div className="space-y-3">
              {recentDamage.map((report) => (
                <div
                  key={report.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/workforce/assets/${report.asset.name}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {report.asset.name}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {report.description}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {new Date(report.reported_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge
                      variant={
                        report.severity === "critical"
                          ? "destructive"
                          : report.severity === "moderate"
                          ? "secondary"
                          : "default"
                      }
                    >
                      {report.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
























