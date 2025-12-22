"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, TrendingUp, Users, DollarSign, AlertTriangle, Mail, Plus } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { CompanySwitcher } from "@/components/agency/CompanySwitcher";

interface AgencyDashboardClientProps {
  agency: {
    agency_id: string;
    agency_name: string;
    role: string;
    total_companies: number;
  };
  stats: {
    total_clients: number;
    total_leads_30d: number;
    total_booked_estimates: number;
    revenue_generated: number;
    avg_domain_deliverability: number | null;
    at_risk_domains: number | null;
    at_risk_campaigns: number | null;
  } | null;
  companies: Array<{
    company_id: string;
    company_name: string;
    company_type: string;
    leads_this_week: number;
    hot_leads: number;
    jobs_won: number;
    revenue: number;
    domain_health_score: number | null;
    deliverability_score: number | null;
  }>;
}

export function AgencyDashboardClient({ agency, stats, companies }: AgencyDashboardClientProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {agency.agency_name}
            </h1>
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-md">
              Agency Mode
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Master dashboard for managing all your roofing company clients
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CompanySwitcher agencyId={agency.agency_id} companies={companies} />
          <Link href="/agency/clients/add">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Company
            </Button>
          </Link>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_clients || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active roofing companies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads (30 days)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_leads_30d || 0}</div>
            <p className="text-xs text-muted-foreground">
              Across all clients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Booked Estimates</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_booked_estimates || 0}</div>
            <p className="text-xs text-muted-foreground">
              In pipeline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Generated</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.revenue_generated || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total across clients
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Domain Health & Deliverability */}
      {(stats?.avg_domain_deliverability !== null || stats?.at_risk_domains !== null) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats?.avg_domain_deliverability !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Avg Domain Deliverability</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.avg_domain_deliverability.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across all client domains
                </p>
              </CardContent>
            </Card>
          )}

          {stats?.at_risk_domains !== null && stats.at_risk_domains > 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  At-Risk Domains
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {stats.at_risk_domains}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Domains needing attention
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Companies List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Companies</CardTitle>
              <CardDescription>
                Manage and monitor all your roofing company clients
              </CardDescription>
            </div>
            <Link href="/agency/clients/add">
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Company
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No companies yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get started by adding your first roofing company client
              </p>
              <Link href="/agency/clients/add">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Company
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {companies.map((company) => (
                <Link
                  key={company.company_id}
                  href={`/agency/companies/${company.company_id}`}
                  className="block"
                >
                  <Card className="hover:bg-accent transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{company.company_name}</h3>
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-md">
                              {company.company_type}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Leads (week)</div>
                              <div className="font-semibold">{company.leads_this_week}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Hot Leads</div>
                              <div className="font-semibold text-orange-600">{company.hot_leads}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Jobs Won</div>
                              <div className="font-semibold">{company.jobs_won}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Revenue</div>
                              <div className="font-semibold">{formatCurrency(company.revenue)}</div>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          View →
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



























