/**
 * Block 110000: Team Leads Inbox
 * /team/leads - Team inbox for leads with assignment functionality
 */

"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { User, Mail, Phone, Calendar, Filter } from "lucide-react";

type Lead = {
  id: string;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
};

type TeamMember = {
  id: string;
  email: string;
  full_name: string | null;
};

export default function TeamLeadsPage() {
  const supabase = createClientComponentClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<string>("all");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Please sign in");
          return;
        }
        setCurrentUserId(user.id);

        // Get user's company
        const { data: membership } = await supabase
          .from("roofing_company_members")
          .select("roofing_company_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .single();

        if (!membership?.roofing_company_id) {
          toast.error("You are not a member of any company");
          return;
        }

        setCompanyId(membership.roofing_company_id);

        // Load team members
        const { data: members } = await supabase
          .from("roofing_company_members")
          .select(
            `
            user_id,
            profiles:user_id (
              id,
              email,
              full_name
            )
          `
          )
          .eq("roofing_company_id", membership.roofing_company_id)
          .eq("is_active", true);

        if (members) {
          const formatted = members
            .map((m: any) => m.profiles)
            .filter(Boolean);
          setTeamMembers(formatted);
        }

        // Load leads
        await loadLeads(membership.roofing_company_id);
      } catch (error: any) {
        console.error("Error loading data:", error);
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  async function loadLeads(companyId: string) {
    try {
      let url = `/api/team/leads?company_id=${companyId}`;
      if (filter !== "all") {
        url += `&filter=${filter}`;
      }
      if (assignmentFilter === "me") {
        url += `&assigned_to=me`;
      } else if (assignmentFilter === "unassigned") {
        url += `&assigned_to=unassigned`;
      } else if (assignmentFilter !== "all") {
        url += `&assigned_to=${assignmentFilter}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.ok) {
        setLeads(data.leads || []);
      } else {
        toast.error(data.error || "Failed to load leads");
      }
    } catch (error: any) {
      console.error("Error loading leads:", error);
      toast.error("Failed to load leads");
    }
  }

  useEffect(() => {
    if (companyId) {
      loadLeads(companyId);
    }
  }, [filter, assignmentFilter, companyId]);

  async function assignLead(leadId: string, userId: string | null) {
    try {
      const res = await fetch(`/api/team/leads/${leadId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: userId }),
      });

      const data = await res.json();

      if (data.ok) {
        toast.success(
          userId ? "Lead assigned successfully" : "Lead unassigned successfully"
        );
        if (companyId) {
          await loadLeads(companyId);
        }
      } else {
        toast.error(data.error || "Failed to assign lead");
      }
    } catch (error: any) {
      console.error("Error assigning lead:", error);
      toast.error("Failed to assign lead");
    }
  }

  const getLeadName = (lead: Lead) => {
    if (lead.name) return lead.name;
    if (lead.first_name || lead.last_name) {
      return `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
    }
    return lead.email;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            You are not a member of any company.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Leads Inbox</h1>
          <p className="text-muted-foreground mt-1">
            Manage and assign leads to your team
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filter:</span>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Lead Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Leads</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="needs_followup">Needs Follow-up</SelectItem>
          </SelectContent>
        </Select>

        <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Assignment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignments</SelectItem>
            <SelectItem value="me">Assigned to Me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {teamMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.full_name || member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Leads Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Lead</th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Assigned To
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-muted-foreground">No leads found</p>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{getLeadName(lead)}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Mail className="h-3 w-3" />
                        {lead.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {lead.phone ? (
                        <div className="text-sm flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          No phone
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{lead.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {lead.profiles ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {lead.profiles.full_name || lead.profiles.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(lead.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={lead.assigned_to || "unassigned"}
                        onValueChange={(value) =>
                          assignLead(lead.id, value === "unassigned" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {teamMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.full_name || member.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


























