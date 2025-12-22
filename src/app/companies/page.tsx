"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Company {
  id: string;
  domain: string;
  name: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  leads_count: number;
  open_deals_count: number;
  open_deals_value: number;
  health_score: number;
  health_category: "hot" | "warm" | "cold";
  last_activity_date: string | null;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    industry: "",
    size: "",
    health: "",
    show_merged: false,
    show_duplicates_only: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.industry) params.append("industry", filters.industry);
        if (filters.size) params.append("size", filters.size);
        if (filters.health) params.append("health", filters.health);
        if (filters.show_merged) params.append("show_merged", "true");
        if (filters.show_duplicates_only) params.append("show_duplicates_only", "true");

        const res = await fetch(`/api/companies/list?${params.toString()}`);
        const json = await res.json();
        setCompanies(json.companies ?? []);
      } catch (error) {
        console.error("Error loading companies:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters]);

  const getHealthColor = (category: string) => {
    switch (category) {
      case "hot":
        return "bg-red-100 text-red-800 border-red-300";
      case "warm":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">Companies</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Companies</h1>
        <div className="flex gap-2">
          <Link href="/companies/duplicates">
            <Button variant="outline">View Duplicates</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={filters.industry}
          onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="">All Industries</option>
          <option value="SaaS">SaaS</option>
          <option value="E-commerce">E-commerce</option>
          <option value="Healthcare">Healthcare</option>
          <option value="Finance">Finance</option>
          <option value="Education">Education</option>
        </select>

        <select
          value={filters.size}
          onChange={(e) => setFilters({ ...filters, size: e.target.value })}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="">All Sizes</option>
          <option value="1-10">1-10</option>
          <option value="11-50">11-50</option>
          <option value="51-200">51-200</option>
          <option value="201-500">201-500</option>
          <option value="501-1000">501-1000</option>
          <option value="1000+">1000+</option>
        </select>

        <select
          value={filters.health}
          onChange={(e) => setFilters({ ...filters, health: e.target.value })}
          className="px-3 py-2 border rounded-md text-sm"
        >
          <option value="">All Health</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>

        <label className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.show_merged}
            onChange={(e) => setFilters({ ...filters, show_merged: e.target.checked })}
            className="rounded"
          />
          <span>Show Merged</span>
        </label>

        <label className="flex items-center gap-2 px-3 py-2 border rounded-md text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={filters.show_duplicates_only}
            onChange={(e) => setFilters({ ...filters, show_duplicates_only: e.target.checked })}
            className="rounded"
          />
          <span>Duplicates Only</span>
        </label>
      </div>

      {companies.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              No companies found. Companies will be automatically created when you import leads.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <Link key={c.id} href={`/companies/${c.id}`}>
              <Card className="hover:bg-accent transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="font-semibold text-lg">
                          {c.name || c.domain}
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium border ${getHealthColor(
                            c.health_category
                          )}`}
                        >
                          {c.health_category.toUpperCase()} ({c.health_score}/100)
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground space-x-3">
                        <span>{c.domain}</span>
                        {c.industry && <span>• {c.industry}</span>}
                        {c.size && <span>• {c.size}</span>}
                        {(c.city || c.state || c.country) && (
                          <span>
                            • {[c.city, c.state, c.country].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span>
                          <strong>{c.leads_count}</strong>{" "}
                          {c.leads_count === 1 ? "lead" : "leads"}
                        </span>
                        {c.open_deals_count > 0 && (
                          <span>
                            <strong>{c.open_deals_count}</strong> open{" "}
                            {c.open_deals_count === 1 ? "deal" : "deals"}
                            {c.open_deals_value > 0 && (
                              <span className="ml-1">
                                ({formatCurrency(c.open_deals_value)})
                              </span>
                            )}
                          </span>
                        )}
                        {c.last_activity_date && (
                          <span className="text-muted-foreground">
                            Last activity: {formatDate(c.last_activity_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

