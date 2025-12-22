// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// Owner Dashboard: Equipment Command Center
// app/(owner)/dashboard/equipment/page.tsx

"use client";

import { useEffect, useState } from "react";
import { 
  Wrench, 
  AlertTriangle, 
  Truck, 
  TrendingUp, 
  Package, 
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  DollarSign
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Equipment {
  id: string;
  name: string;
  type: string;
  condition: string;
  status: string;
  assigned_crew?: { name: string } | null;
  assigned_crew_member?: { name: string } | null;
  last_known_location?: string;
  last_known_job?: { title: string } | null;
}

interface LostEquipment {
  equipment_id: string;
  equipment_name: string;
  checkout_id: string;
  checked_out_at: string;
  hours_checked_out: number;
  crew_member_name: string;
  job_title: string;
}

interface MaintenanceAlert {
  item_id: string;
  item_name: string;
  item_type: string;
  service_type: string;
  alert_level: string;
  days_until_due: number;
  miles_until_due?: number;
}

interface Analytics {
  type: string;
  total_items: number;
  available_count: number;
  checked_out_count: number;
  in_repair_count: number;
  lost_count: number;
  total_purchase_cost: number;
  total_repair_cost: number;
}

export default function EquipmentCommandCenterPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [lostEquipment, setLostEquipment] = useState<LostEquipment[]>([]);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<MaintenanceAlert[]>([]);
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"inventory" | "lost" | "maintenance" | "analytics">("inventory");

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const supabase = createClient();

    try {
      // Load equipment inventory
      const { data: equipmentData } = await supabase
        .from("equipment")
        .select(`
          *,
          assigned_crew:crews(id, name),
          assigned_crew_member:crew_members(id, name),
          last_known_job:roofing_jobs(id, title)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (equipmentData) {
        setEquipment(equipmentData as Equipment[]);
      }

      // Load lost equipment alerts
      const lostResponse = await fetch("/api/equipment/lost-alerts?hours_threshold=24");
      const lostData = await lostResponse.json();
      if (lostData.success) {
        setLostEquipment(lostData.lost_equipment || []);
      }

      // Load maintenance alerts
      const maintenanceResponse = await fetch("/api/fleet/maintenance-alerts?days_ahead=30");
      const maintenanceData = await maintenanceResponse.json();
      if (maintenanceData.success) {
        setMaintenanceAlerts(maintenanceData.alerts || []);
      }

      // Load analytics
      const analyticsResponse = await fetch("/api/equipment/analytics");
      const analyticsData = await analyticsResponse.json();
      if (analyticsData.success) {
        setAnalytics(analyticsData.analytics || []);
      }
    } catch (error) {
      console.error("Error loading equipment data:", error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      available: "bg-green-100 text-green-800",
      checked_out: "bg-blue-100 text-blue-800",
      in_repair: "bg-yellow-100 text-yellow-800",
      lost: "bg-red-100 text-red-800",
    };
    return badges[status as keyof typeof badges] || "bg-gray-100 text-gray-800";
  };

  const getConditionBadge = (condition: string) => {
    const badges = {
      functional: "bg-green-100 text-green-800",
      minor_issues: "bg-yellow-100 text-yellow-800",
      damaged: "bg-red-100 text-red-800",
      out_of_service: "bg-gray-100 text-gray-800",
      lost: "bg-red-100 text-red-800",
    };
    return badges[condition as keyof typeof badges] || "bg-gray-100 text-gray-800";
  };

  const getAlertLevelBadge = (level: string) => {
    const badges = {
      overdue: "bg-red-100 text-red-800",
      due_today: "bg-orange-100 text-orange-800",
      due_this_week: "bg-yellow-100 text-yellow-800",
      due_soon: "bg-blue-100 text-blue-800",
      upcoming: "bg-gray-100 text-gray-800",
    };
    return badges[level as keyof typeof badges] || "bg-gray-100 text-gray-800";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="text-gray-500">Loading equipment data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Equipment Command Center</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track tools, manage fleet, prevent losses, control costs
          </p>
        </div>
        <Link
          href="/dashboard/equipment/add"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Equipment
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Equipment</p>
              <p className="text-2xl font-bold text-gray-900">{equipment.length}</p>
            </div>
            <Package className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Lost Items</p>
              <p className="text-2xl font-bold text-red-600">{lostEquipment.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Maintenance Due</p>
              <p className="text-2xl font-bold text-orange-600">
                {maintenanceAlerts.filter(a => a.alert_level === "overdue" || a.alert_level === "due_today").length}
              </p>
            </div>
            <Truck className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">In Repair</p>
              <p className="text-2xl font-bold text-yellow-600">
                {equipment.filter(e => e.status === "in_repair").length}
              </p>
            </div>
            <Wrench className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: "inventory", label: "Inventory", icon: Package },
            { id: "lost", label: "Lost Items", icon: AlertTriangle },
            { id: "maintenance", label: "Maintenance", icon: Truck },
            { id: "analytics", label: "Analytics", icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "inventory" && (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Equipment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Condition
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {equipment.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{item.type}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getConditionBadge(item.condition)}`}>
                          {item.condition}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.assigned_crew?.name || item.assigned_crew_member?.name || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.last_known_location || item.last_known_job?.title || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "lost" && (
          <div className="space-y-4">
            {lostEquipment.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center border border-gray-200">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500">No lost equipment alerts</p>
              </div>
            ) : (
              lostEquipment.map((item) => (
                <div
                  key={item.checkout_id}
                  className="bg-white rounded-lg shadow p-4 border border-red-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                        <h3 className="text-lg font-semibold text-gray-900">{item.equipment_name}</h3>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Checked out {Math.round(item.hours_checked_out)} hours ago</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>By: {item.crew_member_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span>Job: {item.job_title}</span>
                        </div>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                      Mark Found
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "maintenance" && (
          <div className="space-y-4">
            {maintenanceAlerts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center border border-gray-200">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-gray-500">No maintenance alerts</p>
              </div>
            ) : (
              maintenanceAlerts.map((alert) => (
                <div
                  key={alert.item_id}
                  className="bg-white rounded-lg shadow p-4 border border-gray-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Truck className="w-5 h-5 text-orange-500" />
                        <h3 className="text-lg font-semibold text-gray-900">{alert.item_name}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getAlertLevelBadge(alert.alert_level)}`}>
                          {alert.alert_level.replace("_", " ")}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>Service: {alert.service_type.replace("_", " ")}</div>
                        {alert.days_until_due !== null && (
                          <div>Due in {alert.days_until_due} days</div>
                        )}
                        {alert.miles_until_due !== null && (
                          <div>{Math.round(alert.miles_until_due)} miles until service</div>
                        )}
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                      Schedule Service
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analytics.map((stat) => (
              <div key={stat.type} className="bg-white rounded-lg shadow p-4 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{stat.type.replace("_", " ")}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Total Items:</span>
                    <span className="text-sm font-medium">{stat.total_items}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Available:</span>
                    <span className="text-sm font-medium text-green-600">{stat.available_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Checked Out:</span>
                    <span className="text-sm font-medium text-blue-600">{stat.checked_out_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">In Repair:</span>
                    <span className="text-sm font-medium text-yellow-600">{stat.in_repair_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Lost:</span>
                    <span className="text-sm font-medium text-red-600">{stat.lost_count}</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Total Purchase Cost:</span>
                      <span className="text-sm font-medium">
                        <DollarSign className="w-4 h-4 inline" />
                        {stat.total_purchase_cost?.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Total Repair Cost:</span>
                      <span className="text-sm font-medium">
                        <DollarSign className="w-4 h-4 inline" />
                        {stat.total_repair_cost?.toLocaleString() || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}




























