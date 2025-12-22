"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Filter, Edit, Trash2, Package, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type Asset = {
  id: string;
  name: string;
  category: string;
  serial_number?: string | null;
  status: "available" | "assigned" | "maintenance" | "lost" | "retired";
  photo_url?: string | null;
  purchase_date?: string | null;
  notes?: string | null;
  current_assignment?: {
    id: string;
    employee_id?: string | null;
    job_id?: string | null;
    employee?: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
};

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    loadAssets();
  }, [statusFilter, categoryFilter]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      if (search) params.append("search", search);

      const response = await fetch(`/api/workforce/assets?${params}`);
      const data = await response.json();
      setAssets(data.assets || []);
    } catch (error) {
      console.error("Error loading assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadAssets();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      available: "default",
      assigned: "secondary",
      maintenance: "destructive",
      lost: "destructive",
      retired: "outline",
    };
    return (
      <Badge variant={variants[status] as any}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getCategoryIcon = (category: string) => {
    return <Package className="w-4 h-4" />;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Equipment Registry</h1>
          <p className="text-gray-600 mt-1">
            Track all tools, ladders, vehicles, and equipment
          </p>
        </div>
        <Button
          onClick={() => router.push("/workforce/assets/new")}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Equipment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Equipment</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <form onSubmit={handleSearch} className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by name, serial number..."
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
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="maintenance">Maintenance</option>
              <option value="lost">Lost</option>
              <option value="retired">Retired</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="ladder">Ladders</option>
              <option value="truck">Trucks</option>
              <option value="trailer">Trailers</option>
              <option value="blower">Blowers</option>
              <option value="harness">Harnesses</option>
              <option value="nail_gun">Nail Guns</option>
              <option value="compressor">Compressors</option>
              <option value="saw">Saws</option>
              <option value="tool">Tools</option>
              <option value="vehicle">Vehicles</option>
            </select>
          </div>

          {/* Assets Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No equipment found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Serial #</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Assigned To</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr
                      key={asset.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/workforce/assets/${asset.id}`)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {asset.photo_url ? (
                            <img
                              src={asset.photo_url}
                              alt={asset.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                              {getCategoryIcon(asset.category)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{asset.name}</div>
                            {asset.notes && (
                              <div className="text-sm text-gray-500">{asset.notes}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-700 capitalize">
                        {asset.category.replace("_", " ")}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {asset.serial_number || "—"}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(asset.status)}</td>
                      <td className="py-3 px-4 text-gray-700">
                        {asset.current_assignment?.employee ? (
                          <div>
                            {asset.current_assignment.employee.first_name}{" "}
                            {asset.current_assignment.employee.last_name}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/workforce/assets/${asset.id}/edit`);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle delete
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
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
























