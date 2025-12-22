"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Mail,
  X,
  Search,
  Filter,
  AlertCircle,
  ExternalLink,
  Trash2,
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
import { toast } from "sonner";
import { createClientComponentClient } from "@/lib/supabase";

type SuppressionReason = "manual" | "unsubscribed" | "bounce" | "complaint" | "out_of_scope";

interface Suppression {
  id: string;
  workspace_id: string;
  email: string;
  reason: SuppressionReason;
  created_at: string;
  created_by: string;
  created_by_user_id: string | null;
  notes: string | null;
}

const REASON_LABELS: Record<SuppressionReason, string> = {
  manual: "Manual",
  unsubscribed: "Unsubscribed",
  bounce: "Bounced",
  complaint: "Complaint",
  out_of_scope: "Out of Scope",
};

const REASON_COLORS: Record<SuppressionReason, string> = {
  manual: "bg-gray-100 text-gray-800",
  unsubscribed: "bg-orange-100 text-orange-800",
  bounce: "bg-red-100 text-red-800",
  complaint: "bg-purple-100 text-purple-800",
  out_of_scope: "bg-blue-100 text-blue-800",
};

export default function SuppressionPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadWorkspaceAndSuppressions();
  }, []);

  const loadWorkspaceAndSuppressions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get workspace ID from cookie
      const wsCookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith("ws="));
      const wsId = wsCookie?.split("=")[1];

      if (!wsId) {
        toast.error("No workspace selected");
        return;
      }

      setWorkspaceId(wsId);
      await loadSuppressions(wsId);
    } catch (error) {
      console.error("Error loading workspace:", error);
      toast.error("Failed to load workspace");
    }
  };

  const loadSuppressions = async (wsId: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspace_id: wsId,
        limit: "1000",
      });

      if (filterReason !== "all") {
        params.append("reason", filterReason);
      }

      if (search) {
        params.append("search", search);
      }

      const res = await fetch(`/api/suppression?${params}`);
      if (!res.ok) {
        throw new Error("Failed to load suppressions");
      }

      const data = await res.json();
      setSuppressions(data.data || []);
    } catch (error) {
      console.error("Error loading suppressions:", error);
      toast.error("Failed to load suppressions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      loadSuppressions(workspaceId);
    }
  }, [filterReason, search, workspaceId]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this suppression? This contact will be able to receive emails again.")) {
      return;
    }

    if (!workspaceId) return;

    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/suppression?id=${id}&workspace_id=${workspaceId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to remove suppression");
      }

      toast.success("Suppression removed");
      await loadSuppressions(workspaceId);
    } catch (error: any) {
      toast.error(error.message || "Failed to remove suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredSuppressions = suppressions.filter((s) => {
    if (filterReason !== "all" && s.reason !== filterReason) {
      return false;
    }
    if (search && !s.email.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const reasonCounts = suppressions.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] || 0) + 1;
    return acc;
  }, {} as Record<SuppressionReason, number>);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Contact Suppression List
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your do-not-contact list. Suppressed contacts will never receive emails from SmartSend.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold mt-1">{suppressions.length}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Manual</div>
          <div className="text-2xl font-semibold mt-1">{reasonCounts.manual || 0}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Unsubscribed</div>
          <div className="text-2xl font-semibold mt-1">{reasonCounts.unsubscribed || 0}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Bounced</div>
          <div className="text-2xl font-semibold mt-1">{reasonCounts.bounce || 0}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Complaints</div>
          <div className="text-2xl font-semibold mt-1">{reasonCounts.complaint || 0}</div>
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
        <Select value={filterReason} onValueChange={setFilterReason}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
            <SelectItem value="bounce">Bounced</SelectItem>
            <SelectItem value="complaint">Complaint</SelectItem>
            <SelectItem value="out_of_scope">Out of Scope</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Suppression Works</p>
            <ul className="space-y-1 text-blue-700">
              <li>• Suppressed contacts are automatically blocked from all campaigns and follow-ups</li>
              <li>• Only manual suppressions can be removed (system suppressions are permanent)</li>
              <li>• This protects your domain reputation and keeps you compliant</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Date Added</TableHead>
              <TableHead>Added By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading suppressions...
                </TableCell>
              </TableRow>
            ) : filteredSuppressions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {search || filterReason !== "all"
                    ? "No suppressions match your filters"
                    : "No suppressions yet"}
                </TableCell>
              </TableRow>
            ) : (
              filteredSuppressions.map((suppression) => (
                <TableRow key={suppression.id}>
                  <TableCell className="font-medium">
                    <Mail className="h-4 w-4 inline mr-2 text-muted-foreground" />
                    {suppression.email}
                  </TableCell>
                  <TableCell>
                    <Badge className={REASON_COLORS[suppression.reason]}>
                      {REASON_LABELS[suppression.reason]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(suppression.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {suppression.created_by === "system" ? (
                      <span className="text-xs">System</span>
                    ) : (
                      <span className="text-xs">User</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {suppression.reason === "manual" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(suppression.id)}
                        disabled={deletingId === suppression.id}
                      >
                        {deletingId === suppression.id ? (
                          "Removing..."
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </>
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">System</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
