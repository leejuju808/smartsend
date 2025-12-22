// Block 92000 — SmartSend Roofing Warranties Dashboard v1

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Shield,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Search,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";

interface Warranty {
  id: string;
  homeowner_name: string;
  homeowner_email?: string;
  warranty_type: string;
  warranty_length_years?: number;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  coverage_description?: string;
  job?: {
    id: string;
    title?: string;
    address?: string;
  } | null;
}

interface WarrantiesDashboardProps {
  workspaceId: string;
}

export function WarrantiesDashboard({ workspaceId }: WarrantiesDashboardProps) {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  useEffect(() => {
    loadWarranties();
  }, [workspaceId, filterActive]);

  const loadWarranties = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      let url = `/api/warranties?workspace_id=${workspaceId}`;
      if (filterActive !== null) {
        url += `&is_active=${filterActive}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to load warranties");
      }

      const data = await response.json();
      setWarranties(data.warranties || []);
    } catch (error: any) {
      console.error("Error loading warranties:", error);
      toast.error("Failed to load warranties");
    } finally {
      setLoading(false);
    }
  };

  const filteredWarranties = warranties.filter((warranty) => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        warranty.homeowner_name.toLowerCase().includes(search) ||
        warranty.homeowner_email?.toLowerCase().includes(search) ||
        warranty.job?.title?.toLowerCase().includes(search) ||
        warranty.job?.address?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const activeWarranties = warranties.filter((w) => w.is_active);
  const expiringSoon = warranties.filter((w) => {
    if (!w.end_date || !w.is_active) return false;
    const endDate = new Date(w.end_date);
    const daysUntilExpiry = Math.ceil(
      (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
  });
  const expired = warranties.filter((w) => {
    if (!w.end_date) return false;
    return new Date(w.end_date) < new Date();
  });

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Warranties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all warranties and service coverage
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Warranties</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{warranties.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{activeWarranties.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{expiringSoon.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{expired.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by homeowner, job, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={filterActive === null ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(null)}
              >
                All
              </Button>
              <Button
                variant={filterActive === true ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(true)}
              >
                Active
              </Button>
              <Button
                variant={filterActive === false ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterActive(false)}
              >
                Inactive
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warranties Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Warranties</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredWarranties.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No warranties found
            </p>
          ) : (
            <div className="space-y-4">
              {filteredWarranties.map((warranty) => {
                const isExpired = warranty.end_date
                  ? new Date(warranty.end_date) < new Date()
                  : false;
                const isExpiringSoon = warranty.end_date
                  ? (() => {
                      const endDate = new Date(warranty.end_date);
                      const daysUntilExpiry = Math.ceil(
                        (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                      );
                      return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
                    })()
                  : false;

                return (
                  <div
                    key={warranty.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <p className="font-medium">{warranty.homeowner_name}</p>
                        <Badge variant="outline">{warranty.warranty_type}</Badge>
                        {!warranty.is_active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {isExpired && (
                          <Badge variant="destructive">Expired</Badge>
                        )}
                        {isExpiringSoon && (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                            Expiring Soon
                          </Badge>
                        )}
                      </div>
                      {warranty.homeowner_email && (
                        <p className="text-sm text-muted-foreground">
                          {warranty.homeowner_email}
                        </p>
                      )}
                      {warranty.job && (
                        <p className="text-sm text-muted-foreground">
                          Job: {warranty.job.title || warranty.job.address || "Job #" + warranty.job.id.slice(0, 8)}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Start: {format(new Date(warranty.start_date), "MMM d, yyyy")}
                        </span>
                        {warranty.end_date && (
                          <span>
                            End: {format(new Date(warranty.end_date), "MMM d, yyyy")}
                          </span>
                        )}
                        {warranty.warranty_length_years && (
                          <span>{warranty.warranty_length_years} years</span>
                        )}
                        {!warranty.end_date && <span>Lifetime</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {warranty.job && (
                        <Link href={`/jobs/${warranty.job.id}`}>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



























