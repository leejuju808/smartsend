"use client";

// Block 89000 — SmartSend Roofing Materials Dashboard
// Main materials management page with KPI cards, recent orders, templates, suppliers

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Package, Send, Calendar, DollarSign, TrendingUp } from "lucide-react";
import Link from "next/link";

type DashboardData = {
  ordersThisWeek: number;
  ordersSent: number;
  deliveriesScheduled: number;
  totalMaterialCosts: number;
  profitabilityForecast: number;
  recentOrders: any[];
  draftOrders: any[];
};

export default function MaterialsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await fetch("/api/materials/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading materials dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-lg text-red-600">Failed to load dashboard</div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Materials & Supplier Orders</h1>
          <p className="text-gray-600 mt-1">
            Manage material templates, orders, and supplier relationships
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/materials/templates/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders This Week</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.ordersThisWeek}</div>
            <p className="text-xs text-muted-foreground">New material orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.ordersSent}</div>
            <p className="text-xs text-muted-foreground">Sent to suppliers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deliveries Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.deliveriesScheduled}</div>
            <p className="text-xs text-muted-foreground">With delivery dates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Material Costs</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalMaterialCosts)}</div>
            <p className="text-xs text-muted-foreground">All orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profitability Forecast</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              data.profitabilityForecast >= 0 ? "text-green-600" : "text-red-600"
            }`}>
              {formatCurrency(data.profitabilityForecast)}
            </div>
            <p className="text-xs text-muted-foreground">Revenue - Costs</p>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length > 0 ? (
              <div className="space-y-2">
                {data.recentOrders.map((order: any) => (
                  <div
                    key={order.id}
                    className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <div className="font-medium">
                        {order.jobs?.leads?.first_name} {order.jobs?.leads?.last_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {order.suppliers?.name || "No supplier"} • {order.status}
                      </div>
                      {order.delivery_date && (
                        <div className="text-xs text-gray-500">
                          Delivery: {new Date(order.delivery_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      {order.total_cost && (
                        <div className="font-semibold">
                          {formatCurrency(parseFloat(order.total_cost.toString()))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">No recent orders</div>
            )}
          </CardContent>
        </Card>

        {/* Draft Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Draft Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {data.draftOrders.length > 0 ? (
              <div className="space-y-2">
                {data.draftOrders.map((order: any) => (
                  <div
                    key={order.id}
                    className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <div className="font-medium">
                        {order.jobs?.leads?.first_name} {order.jobs?.leads?.last_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        Created: {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      Complete
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">No draft orders</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/materials/templates">
          <Card className="hover:bg-gray-50 cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">Material Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Create and manage reusable material templates for different roof types
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/materials/suppliers">
          <Card className="hover:bg-gray-50 cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">Suppliers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Manage supplier contacts and relationships
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/materials/orders">
          <Card className="hover:bg-gray-50 cursor-pointer">
            <CardHeader>
              <CardTitle className="text-lg">All Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                View and manage all material orders
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}



























