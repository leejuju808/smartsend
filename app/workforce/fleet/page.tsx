"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Truck,
  AlertCircle,
  Wrench,
  DollarSign,
  TrendingUp,
  Upload,
  Activity,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type Vehicle = {
  id: string;
  name: string;
  license_plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  status: "active" | "maintenance" | "retired";
  photo_url?: string | null;
  health_score: number;
  current_mileage?: number;
  last_mileage_date?: string | null;
  maintenance_due?: string | null;
  fuel_cost_mtd?: number;
  current_assignment?: {
    id: string;
    employee_id?: string | null;
    employee?: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
};

export default function FleetPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    loadVehicles();
  }, [statusFilter]);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (search) params.append("search", search);

      const response = await fetch(`/api/fleet/vehicles?${params}`);
      const data = await response.json();
      setVehicles(data.vehicles || []);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadVehicles();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      active: "default",
      maintenance: "destructive",
      retired: "outline",
    };
    return (
      <Badge variant={variants[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fleet Directory</h1>
          <p className="text-gray-600 mt-1">
            Manage your entire fleet: trucks, vans, trailers
          </p>
        </div>
        <Button
          onClick={() => router.push("/workforce/fleet/new")}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Vehicle
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Vehicles</p>
                <p className="text-2xl font-bold">{vehicles.length}</p>
              </div>
              <Truck className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl font-bold">
                  {vehicles.filter((v) => v.status === "active").length}
                </p>
              </div>
              <Activity className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Maintenance</p>
                <p className="text-2xl font-bold">
                  {vehicles.filter((v) => v.status === "maintenance").length}
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
                <p className="text-sm text-gray-600">Fuel Cost (MTD)</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    vehicles.reduce((sum, v) => sum + (v.fuel_cost_mtd || 0), 0)
                  )}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vehicles</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by name, license plate, make, model..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </form>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          {/* Vehicles Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Truck className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No vehicles found</p>
              <Button
                onClick={() => router.push("/workforce/fleet/new")}
                className="mt-4"
              >
                Add Your First Vehicle
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Vehicle
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Assigned Driver
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Mileage
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Health Score
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Maintenance Due
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Fuel Cost (MTD)
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle) => (
                    <tr
                      key={vehicle.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/workforce/fleet/${vehicle.id}`)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {vehicle.photo_url ? (
                            <img
                              src={vehicle.photo_url}
                              alt={vehicle.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                              <Truck className="w-5 h-5 text-gray-500" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {vehicle.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {vehicle.year} {vehicle.make} {vehicle.model}
                              {vehicle.license_plate && ` • ${vehicle.license_plate}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {vehicle.current_assignment?.employee ? (
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4 text-gray-400" />
                            {vehicle.current_assignment.employee.first_name}{" "}
                            {vehicle.current_assignment.employee.last_name}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {vehicle.current_mileage
                          ? `${vehicle.current_mileage.toLocaleString()} mi`
                          : "—"}
                        {vehicle.last_mileage_date && (
                          <div className="text-xs text-gray-500">
                            {new Date(vehicle.last_mileage_date).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span
                            className={`font-bold ${getHealthScoreColor(
                              vehicle.health_score
                            )}`}
                          >
                            {vehicle.health_score}
                          </span>
                          <TrendingUp
                            className={`w-4 h-4 ${getHealthScoreColor(
                              vehicle.health_score
                            )}`}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {vehicle.maintenance_due ? (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{vehicle.maintenance_due}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {vehicle.fuel_cost_mtd
                          ? formatCurrency(vehicle.fuel_cost_mtd)
                          : "$0.00"}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(vehicle.status)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/workforce/fleet/${vehicle.id}`);
                            }}
                            title="View Details"
                          >
                            <Activity className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle assign driver
                            }}
                            title="Assign Driver"
                          >
                            <User className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle upload dashcam
                            }}
                            title="Upload Dashcam"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle add maintenance
                            }}
                            title="Add Maintenance"
                          >
                            <Wrench className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/workforce/fleet/${vehicle.id}/edit`);
                            }}
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
























