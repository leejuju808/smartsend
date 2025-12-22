"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Mail,
  AlertCircle,
  X,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Merge,
  Ban,
  AlertTriangle,
  UserX,
  Copy,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { createClientComponentClient } from "@/lib/supabase";

type BadLeadCategory =
  | "hard_bounce"
  | "soft_bounce"
  | "spam_complaint"
  | "not_interested"
  | "time_waster"
  | "duplicate"
  | "bad_data"
  | "unsubscribed"
  | "invalid_email"
  | "disposable_email"
  | "role_account";

interface BadLead {
  id: string;
  workspace_id: string;
  email: string;
  category: BadLeadCategory;
  reason: string | null;
  detection_method: string;
  detected_at: string;
  is_suppressed: boolean;
  suppression_level: string;
  lead?: { id: string; email: string; first_name?: string; last_name?: string } | null;
  contact?: { id: string; email: string; first_name?: string; last_name?: string } | null;
  campaign?: { id: string; name: string } | null;
  metadata?: Record<string, unknown>;
}

const CATEGORY_LABELS: Record<BadLeadCategory, string> = {
  hard_bounce: "Hard Bounce",
  soft_bounce: "Soft Bounce",
  spam_complaint: "Spam Complaint",
  not_interested: "Not Interested",
  time_waster: "Time Waster",
  duplicate: "Duplicate",
  bad_data: "Bad Data",
  unsubscribed: "Unsubscribed",
  invalid_email: "Invalid Email",
  disposable_email: "Disposable Email",
  role_account: "Role Account",
};

const CATEGORY_COLORS: Record<BadLeadCategory, string> = {
  hard_bounce: "bg-red-100 text-red-800",
  soft_bounce: "bg-orange-100 text-orange-800",
  spam_complaint: "bg-purple-100 text-purple-800",
  not_interested: "bg-yellow-100 text-yellow-800",
  time_waster: "bg-pink-100 text-pink-800",
  duplicate: "bg-blue-100 text-blue-800",
  bad_data: "bg-gray-100 text-gray-800",
  unsubscribed: "bg-indigo-100 text-indigo-800",
  invalid_email: "bg-red-100 text-red-800",
  disposable_email: "bg-amber-100 text-amber-800",
  role_account: "bg-slate-100 text-slate-800",
};

const CATEGORY_ICONS: Record<BadLeadCategory, typeof AlertCircle> = {
  hard_bounce: X,
  soft_bounce: AlertTriangle,
  spam_complaint: Ban,
  not_interested: UserX,
  time_waster: AlertTriangle,
  duplicate: Copy,
  bad_data: Database,
  unsubscribed: Ban,
  invalid_email: X,
  disposable_email: Mail,
  role_account: Mail,
};

export default function BadLeadsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [badLeads, setBadLeads] = useState<BadLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterCampaign, setFilterCampaign] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    loadWorkspaceAndBadLeads();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadBadLeads();
      loadStats();
    }
  }, [workspaceId, filterCategory, filterCampaign, search, activeTab]);

  const loadWorkspaceAndBadLeads = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get workspace ID from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("current_workspace_id")
        .eq("id", user.id)
        .single();

      if (!profile?.current_workspace_id) {
        toast.error("No workspace selected");
        return;
      }

      setWorkspaceId(profile.current_workspace_id);
    } catch (error) {
      console.error("Error loading workspace:", error);
      toast.error("Failed to load workspace");
    }
  };

  const loadBadLeads = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "1000",
      });

      if (filterCategory !== "all") {
        params.append("category", filterCategory);
      }

      if (filterCampaign !== "all") {
        params.append("campaign_id", filterCampaign);
      }

      const res = await fetch(`/api/badleads/list?${params}`);
      if (!res.ok) {
        throw new Error("Failed to load bad leads");
      }

      const data = await res.json();
      let leads = data.data || [];

      // Filter by search
      if (search) {
        leads = leads.filter((lead: BadLead) =>
          lead.email.toLowerCase().includes(search.toLowerCase())
        );
      }

      // Filter by active tab
      if (activeTab !== "all") {
        leads = leads.filter((lead: BadLead) => lead.category === activeTab);
      }

      setBadLeads(leads);
    } catch (error) {
      console.error("Error loading bad leads:", error);
      toast.error("Failed to load bad leads");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!workspaceId) return;

    try {
      const res = await fetch(`/api/badleads/stats?workspace_id=${workspaceId}`);
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      setStats(data.stats?.by_category || {});
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const handleSuppress = async (email: string, category: BadLeadCategory) => {
    if (!workspaceId) return;

    try {
      const res = await fetch("/api/badleads/suppress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          category,
          reason: `Manual suppression from Bad Leads dashboard`,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to suppress lead");
      }

      toast.success("Lead suppressed");
      await loadBadLeads();
      await loadStats();
    } catch (error: any) {
      toast.error(error.message || "Failed to suppress lead");
    }
  };

  const handleMerge = async (primaryId: string, duplicateId: string) => {
    if (!workspaceId) return;

    try {
      const res = await fetch("/api/badleads/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_lead_id: primaryId,
          duplicate_lead_id: duplicateId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to merge leads");
      }

      toast.success("Leads merged successfully");
      await loadBadLeads();
      await loadStats();
    } catch (error: any) {
      toast.error(error.message || "Failed to merge leads");
    }
  };

  const categoryCounts = Object.keys(CATEGORY_LABELS).reduce((acc, cat) => {
    acc[cat] = stats[cat] || 0;
    return acc;
  }, {} as Record<string, number>);

  const totalBadLeads = badLeads.length;
  const suppressedCount = badLeads.filter((l) => l.is_suppressed).length;

  const filteredBadLeads = badLeads.filter((lead) => {
    if (activeTab !== "all" && lead.category !== activeTab) {
      return false;
    }
    if (search && !lead.email.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Bad Lead Manager
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated cleanup system for bounces, spam, dead emails, not-interested detection, time-wasters & global suppression controls.
          </p>
        </div>
        <Button onClick={loadBadLeads} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Bad Leads</div>
          <div className="text-2xl font-semibold mt-1">{totalBadLeads}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Suppressed</div>
          <div className="text-2xl font-semibold mt-1">{suppressedCount}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Bounces</div>
          <div className="text-2xl font-semibold mt-1">
            {(categoryCounts.hard_bounce || 0) + (categoryCounts.soft_bounce || 0)}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Complaints</div>
          <div className="text-2xl font-semibold mt-1">{categoryCounts.spam_complaint || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Bad Lead Manager Works</p>
            <ul className="space-y-1 text-blue-700">
              <li>• Automatically detects and suppresses hard bounces, spam complaints, and not-interested leads</li>
              <li>• Protects your domain reputation and reduces sending costs</li>
              <li>• Bad leads are automatically removed before campaigns send</li>
              <li>• Global suppressions are permanent; list-level suppressions can be reviewed</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="hard_bounce">
            Hard Bounces {categoryCounts.hard_bounce > 0 && `(${categoryCounts.hard_bounce})`}
          </TabsTrigger>
          <TabsTrigger value="soft_bounce">
            Soft Bounces {categoryCounts.soft_bounce > 0 && `(${categoryCounts.soft_bounce})`}
          </TabsTrigger>
          <TabsTrigger value="spam_complaint">
            Spam {categoryCounts.spam_complaint > 0 && `(${categoryCounts.spam_complaint})`}
          </TabsTrigger>
          <TabsTrigger value="not_interested">
            Not Interested {categoryCounts.not_interested > 0 && `(${categoryCounts.not_interested})`}
          </TabsTrigger>
          <TabsTrigger value="time_waster">
            Time Wasters {categoryCounts.time_waster > 0 && `(${categoryCounts.time_waster})`}
          </TabsTrigger>
          <TabsTrigger value="duplicate">
            Duplicates {categoryCounts.duplicate > 0 && `(${categoryCounts.duplicate})`}
          </TabsTrigger>
          <TabsTrigger value="bad_data">
            Bad Data {categoryCounts.bad_data > 0 && `(${categoryCounts.bad_data})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {/* Table */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading bad leads...
                    </TableCell>
                  </TableRow>
                ) : filteredBadLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {search || activeTab !== "all"
                        ? "No bad leads match your filters"
                        : "No bad leads detected yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBadLeads.map((lead) => {
                    const Icon = CATEGORY_ICONS[lead.category];
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium">
                          <Mail className="h-4 w-4 inline mr-2 text-muted-foreground" />
                          {lead.email}
                        </TableCell>
                        <TableCell>
                          <Badge className={CATEGORY_COLORS[lead.category]}>
                            <Icon className="h-3 w-3 mr-1" />
                            {CATEGORY_LABELS[lead.category]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {lead.reason || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(lead.detected_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {lead.is_suppressed ? (
                            <Badge variant="outline" className="bg-green-50 text-green-800">
                              Suppressed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-800">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {lead.category === "duplicate" && lead.lead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  // Handle merge - would need primary_lead_id
                                  toast.info("Merge functionality - select primary lead first");
                                }}
                              >
                                <Merge className="h-4 w-4" />
                              </Button>
                            )}
                            {!lead.is_suppressed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSuppress(lead.email, lead.category)}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}





















































