// Service Center - Office Dashboard for managing service tickets
// Block 229000 — SmartSend Roofing Warranty Manager + Service Ticket System

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Wrench,
  Filter,
  Search,
  Plus,
  Calendar,
  User,
  Phone,
  Mail,
  MapPin,
  Shield,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import Link from "next/link";

type ServiceTicket = {
  id: string;
  ticket_number: string;
  ticket_type: string;
  description: string;
  priority: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  property_address: string | null;
  scheduled_date: string | null;
  is_warranty_covered: boolean;
  created_at: string;
  homeowner?: { name: string; email: string } | null;
  job?: { id: string; title: string; address: string } | null;
  warranty?: { id: string; warranty_type: string } | null;
  assignments?: Array<{
    id: string;
    crew?: { id: string; name: string; lead_name: string } | null;
    scheduled_date: string;
    scheduled_time: string | null;
    status: string;
  }>;
};

export default function ServiceCenterPage() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [warrantyFilter, setWarrantyFilter] = useState<string>("all");

  useEffect(() => {
    loadTickets();
  }, [statusFilter, priorityFilter, warrantyFilter]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (priorityFilter !== "all") params.append("priority", priorityFilter);
      if (warrantyFilter === "warranty_only") params.append("warranty_only", "true");
      if (warrantyFilter === "out_of_warranty") params.append("out_of_warranty", "true");

      const response = await fetch(`/api/service/tickets?${params.toString()}`);
      const data = await response.json();
      if (data.tickets) {
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error("Error loading tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        ticket.ticket_number?.toLowerCase().includes(query) ||
        ticket.customer_name?.toLowerCase().includes(query) ||
        ticket.property_address?.toLowerCase().includes(query) ||
        ticket.description?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      open: { label: "Open", className: "bg-yellow-100 text-yellow-800" },
      scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-800" },
      in_progress: { label: "In Progress", className: "bg-purple-100 text-purple-800" },
      completed: { label: "Completed", className: "bg-green-100 text-green-800" },
      closed: { label: "Closed", className: "bg-gray-100 text-gray-800" },
    };
    const statusConfig = config[status] || { label: status, className: "bg-gray-100 text-gray-800" };
    return <Badge className={statusConfig.className}>{statusConfig.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { label: string; className: string }> = {
      low: { label: "Low", className: "bg-gray-100 text-gray-800" },
      normal: { label: "Normal", className: "bg-blue-100 text-blue-800" },
      high: { label: "High", className: "bg-orange-100 text-orange-800" },
      urgent: { label: "Urgent", className: "bg-red-100 text-red-800" },
    };
    const priorityConfig = config[priority] || config.normal;
    return <Badge className={priorityConfig.className}>{priorityConfig.label}</Badge>;
  };

  const stats = {
    open: tickets.filter((t) => t.status === "open").length,
    scheduled: tickets.filter((t) => t.status === "scheduled").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    high_priority: tickets.filter((t) => t.priority === "high" || t.priority === "urgent").length,
    warranty: tickets.filter((t) => t.is_warranty_covered).length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Center</h1>
          <p className="text-muted-foreground mt-1">
            Manage service tickets, assign crews, and track warranty work
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/service-center/create">
            <Plus className="h-4 w-4 mr-2" />
            Create Ticket
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Tickets</p>
                <p className="text-2xl font-bold">{stats.open}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold">{stats.scheduled}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">{stats.in_progress}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold">{stats.high_priority}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warranty</p>
                <p className="text-2xl font-bold">{stats.warranty}</p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={warrantyFilter} onValueChange={setWarrantyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Warranty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="warranty_only">Warranty Only</SelectItem>
                <SelectItem value="out_of_warranty">Out of Warranty</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Service Tickets</CardTitle>
          <CardDescription>
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No service tickets found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <p className="font-semibold">#{ticket.ticket_number}</p>
                        {getStatusBadge(ticket.status)}
                        {getPriorityBadge(ticket.priority)}
                        {ticket.is_warranty_covered && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Warranty
                          </Badge>
                        )}
                      </div>

                      <div>
                        <p className="font-medium capitalize">
                          {ticket.ticket_type.replace("_", " ")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {ticket.description}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="font-medium">Customer</p>
                          <p className="text-muted-foreground">
                            {ticket.customer_name || ticket.homeowner?.name || "N/A"}
                          </p>
                          {ticket.customer_phone && (
                            <p className="text-muted-foreground flex items-center gap-1 mt-1">
                              <Phone className="h-3 w-3" />
                              {ticket.customer_phone}
                            </p>
                          )}
                          {ticket.customer_email && (
                            <p className="text-muted-foreground flex items-center gap-1 mt-1">
                              <Mail className="h-3 w-3" />
                              {ticket.customer_email}
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="font-medium">Property</p>
                          {ticket.property_address ? (
                            <p className="text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {ticket.property_address}
                            </p>
                          ) : ticket.job?.address ? (
                            <p className="text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {ticket.job.address}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">N/A</p>
                          )}
                        </div>

                        <div>
                          <p className="font-medium">Crew Assignment</p>
                          {ticket.assignments && ticket.assignments.length > 0 ? (
                            <div>
                              <p className="text-muted-foreground">
                                {ticket.assignments[0].crew?.name || "Assigned"}
                              </p>
                              {ticket.assignments[0].scheduled_date && (
                                <p className="text-muted-foreground text-xs mt-1">
                                  {new Date(ticket.assignments[0].scheduled_date).toLocaleDateString()}
                                  {ticket.assignments[0].scheduled_time &&
                                    ` at ${ticket.assignments[0].scheduled_time}`}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-muted-foreground">Not assigned</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/service-center/${ticket.id}`}>
                          View Details
                        </Link>
                      </Button>
                      {ticket.status === "open" && (
                        <Button variant="default" size="sm" asChild>
                          <Link href={`/dashboard/service-center/${ticket.id}/assign`}>
                            Assign Crew
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

























