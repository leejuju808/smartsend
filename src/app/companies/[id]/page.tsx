"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { CompanyMergeWizard } from "@/components/companies/CompanyMergeWizard";

type Tab = "overview" | "people" | "deals" | "activity";

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
  logo_url: string | null;
  enrichment_score: number;
  is_merged?: boolean;
  merged_into?: string | null;
}

interface Duplicate {
  id: string;
  company_id: string;
  duplicate_company_id: string;
  score: number;
  match_type: string;
  company: Company;
  duplicate_company: Company;
}

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  title: string | null;
  status: string;
  owner_id: string | null;
}

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  occurred_at: string;
  activity_type: "lead" | "deal";
  metadata?: any;
}

interface Stats {
  total_leads: number;
  high_intent_leads: number;
  open_deals_count: number;
  open_deals_value: number;
  sent_count: number;
  open_rate: number;
  reply_rate: number;
  last_outbound_email: string | null;
  last_reply: string | null;
  last_deal_update: string | null;
}

export default function CompanyProfile() {
  const params = useParams();
  const companyId = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [company, setCompany] = useState<Company | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [mergeWizardOpen, setMergeWizardOpen] = useState(false);
  const [selectedDuplicateId, setSelectedDuplicateId] = useState<string | null>(null);
  const [primaryCompany, setPrimaryCompany] = useState<Company | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/companies/get?id=${companyId}`);
      const json = await res.json();
      setCompany(json.company);
      setLeads(json.leads || []);
      setDeals(json.deals || []);
      setActivities(json.activities || []);
      setStats(json.stats || null);
      
      // Load duplicates
      const dupRes = await fetch(`/api/companies/duplicates?company_id=${companyId}`);
      const dupJson = await dupRes.json();
      setDuplicates(dupJson.duplicates || []);
      
      // If merged, load primary company
      if (json.company?.merged_into) {
        const primaryRes = await fetch(`/api/companies/get?id=${json.company.merged_into}`);
        const primaryJson = await primaryRes.json();
        setPrimaryCompany(primaryJson.company);
      }
    } catch (error) {
      console.error("Error loading company:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [companyId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getLocation = () => {
    const parts = [company?.city, company?.state, company?.country].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const filteredActivities = activities.filter((a) => {
    if (activityFilter === "all") return true;
    if (activityFilter === "emails") {
      return a.type === "email_sent" || a.type === "email_open" || a.type === "email_click";
    }
    if (activityFilter === "replies") return a.type === "reply";
    if (activityFilter === "deals") return a.activity_type === "deal";
    if (activityFilter === "notes") return a.type === "note_added";
    if (activityFilter === "system") return a.type.includes("system") || a.type === "owner_changed";
    return true;
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Company not found</div>
      </div>
    );
  }

  const handleMergeClick = (duplicateCompanyId: string) => {
    setSelectedDuplicateId(duplicateCompanyId);
    setMergeWizardOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Merge Banner */}
      {company?.is_merged && primaryCompany && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  This company was merged into{" "}
                  <Link href={`/companies/${primaryCompany.id}`} className="underline">
                    {primaryCompany.name || primaryCompany.domain}
                  </Link>
                </p>
              </div>
              <Link href={`/companies/${primaryCompany.id}`}>
                <Button size="sm" variant="outline">
                  View Primary Company
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicates Banner */}
      {duplicates.length > 0 && !company?.is_merged && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-base">Possible Duplicates ({duplicates.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {duplicates.slice(0, 3).map((dup) => {
                const otherCompany = dup.company_id === companyId ? dup.duplicate_company : dup.company;
                return (
                  <div key={dup.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="font-medium">{otherCompany.name || otherCompany.domain}</div>
                      <div className="text-sm text-muted-foreground">
                        Score: {dup.score} • {dup.match_type}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleMergeClick(otherCompany.id)}
                    >
                      Review and Merge
                    </Button>
                  </div>
                );
              })}
              {duplicates.length > 3 && (
                <Link href="/companies/duplicates">
                  <Button variant="outline" size="sm" className="w-full">
                    View All Duplicates ({duplicates.length})
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {company.logo_url && (
            <img
              src={company.logo_url}
              alt={company.name || company.domain}
              className="w-16 h-16 rounded-lg object-cover"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{company.name || company.domain}</h1>
            <div className="text-sm text-muted-foreground mt-1 space-x-2">
              <span>{company.domain}</span>
              {company.industry && <span>• {company.industry}</span>}
              {company.size && <span>• {company.size}</span>}
              {getLocation() && <span>• {getLocation()}</span>}
            </div>
            <div className="mt-2 text-sm">
              <span>Enrichment: {company.enrichment_score}/100</span>
              <span className="ml-4">
                Leads: {stats?.total_leads || 0} | Deals: {stats?.open_deals_count || 0} | Open
                Opportunities: {formatCurrency(stats?.open_deals_value || 0)}
              </span>
            </div>
          </div>
        </div>
        <Link
          href="/companies"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Companies
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8">
          {(["overview", "people", "deals", "activity"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Account Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Account Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold">{stats?.total_leads || 0}</div>
                  <div className="text-sm text-muted-foreground">Total Leads</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats?.high_intent_leads || 0}</div>
                  <div className="text-sm text-muted-foreground">High-Intent Leads</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats?.open_deals_count || 0}</div>
                  <div className="text-sm text-muted-foreground">Open Deals</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(stats?.open_deals_value || 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Open Opportunities</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Engagement Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Engagement Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Sent:</span>
                  <span className="font-medium">{stats?.sent_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Open Rate:</span>
                  <span className="font-medium">
                    {stats?.open_rate ? `${(stats.open_rate * 100).toFixed(1)}%` : "0%"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Reply Rate:</span>
                  <span className="font-medium">
                    {stats?.reply_rate ? `${(stats.reply_rate * 100).toFixed(1)}%` : "0%"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Last Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Last Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <strong>Last Outbound Email:</strong> {formatDate(stats?.last_outbound_email || null)}
              </div>
              <div>
                <strong>Last Reply:</strong> {formatDate(stats?.last_reply || null)}
              </div>
              <div>
                <strong>Last Deal Update:</strong> {formatDate(stats?.last_deal_update || null)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* People Tab */}
      {activeTab === "people" && (
        <Card>
          <CardHeader>
            <CardTitle>People ({leads.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No leads associated with this company yet.
              </div>
            ) : (
              <div className="space-y-2">
                {leads.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`}>
                    <div className="border rounded p-3 hover:bg-accent transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {l.first_name} {l.last_name}
                          </div>
                          <div className="text-sm text-muted-foreground">{l.email}</div>
                          {l.title && (
                            <div className="text-sm text-muted-foreground">{l.title}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                l.status === "replied"
                                  ? "bg-green-100 text-green-800"
                                  : l.status === "high_intent"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {l.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Deals Tab */}
      {activeTab === "deals" && (
        <Card>
          <CardHeader>
            <CardTitle>Deals ({deals.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <div className="text-sm text-muted-foreground">No deals for this company yet.</div>
            ) : (
              <div className="space-y-2">
                {deals.map((d) => (
                  <Link key={d.id} href={`/deals/${d.id}`}>
                    <div className="border rounded p-3 hover:bg-accent transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{d.title}</div>
                          <div className="text-sm text-muted-foreground">
                            Stage: {d.stage} • {formatCurrency(d.value || 0)}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Updated: {formatDate(d.updated_at)}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity Tab */}
      {activeTab === "activity" && (
        <div className="space-y-4">
          {/* Activity Filters */}
          <div className="flex gap-2">
            {["all", "emails", "replies", "deals", "notes", "system"].map((filter) => (
              <button
                key={filter}
                onClick={() => setActivityFilter(filter)}
                className={`px-3 py-1 rounded text-sm capitalize ${
                  activityFilter === filter
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredActivities.length === 0 ? (
                <div className="text-sm text-muted-foreground">No activity found.</div>
              ) : (
                <div className="space-y-4">
                  {filteredActivities.map((a) => (
                    <div key={a.id} className="flex gap-4 border-l-2 pl-4 py-2">
                      <div className="flex-1">
                        <div className="font-medium">{a.title || a.type}</div>
                        {a.body && (
                          <div className="text-sm text-muted-foreground mt-1">{a.body}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(a.occurred_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Merge Wizard */}
      {selectedDuplicateId && (
        <CompanyMergeWizard
          open={mergeWizardOpen}
          onOpenChange={(open) => {
            setMergeWizardOpen(open);
            if (!open) {
              setSelectedDuplicateId(null);
              load(); // Reload after merge
            }
          }}
          primaryCompanyId={companyId}
          mergedCompanyId={selectedDuplicateId}
          onSuccess={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
