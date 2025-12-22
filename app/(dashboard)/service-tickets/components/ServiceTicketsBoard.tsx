// Block 92000 — SmartSend Roofing Service Tickets Kanban Board v1

"use client";

import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  AlertCircle,
  Clock,
  Wrench,
  CheckCircle2,
  XCircle,
  Plus,
  Shield,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";

const STATUSES = [
  { id: "open", label: "Open", icon: AlertCircle, color: "bg-blue-500" },
  { id: "scheduled", label: "Scheduled", icon: Clock, color: "bg-yellow-500" },
  { id: "in_progress", label: "In Progress", icon: Wrench, color: "bg-purple-500" },
  { id: "completed", label: "Completed", icon: CheckCircle2, color: "bg-green-500" },
  { id: "closed", label: "Closed", icon: XCircle, color: "bg-gray-500" },
];

interface ServiceTicket {
  id: string;
  homeowner_name: string;
  homeowner_email?: string;
  issue_description: string;
  issue_category?: string;
  ticket_status: string;
  priority: string;
  is_warranty_covered?: boolean;
  should_charge_homeowner?: boolean;
  scheduled_date?: string;
  created_at: string;
  job?: {
    id: string;
    title?: string;
    address?: string;
  } | null;
  warranty?: {
    id: string;
    warranty_type: string;
    end_date?: string;
  } | null;
  photos?: Array<{
    id: string;
    photo_url: string;
  }>;
  assignments?: Array<{
    crew?: {
      name: string;
    };
    scheduled_date: string;
  }>;
}

interface ServiceTicketsBoardProps {
  workspaceId: string;
}

export function ServiceTicketsBoard({ workspaceId }: ServiceTicketsBoardProps) {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, [workspaceId]);

  const loadTickets = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/service-tickets?workspace_id=${workspaceId}`
      );

      if (!response.ok) {
        throw new Error("Failed to load tickets");
      }

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error: any) {
      console.error("Error loading tickets:", error);
      toast.error("Failed to load service tickets");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const ticketId = result.draggableId;
    const newStatus = result.destination.droppableId;

    // Optimistic update
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, ticket_status: newStatus }
          : ticket
      )
    );

    try {
      const response = await fetch(`/api/service-tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticket_status: newStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update ticket");
      }

      toast.success("Ticket status updated");
    } catch (error: any) {
      console.error("Error updating ticket:", error);
      toast.error("Failed to update ticket status");
      loadTickets(); // Reload on error
    }
  };

  const getTicketsByStatus = (status: string) => {
    return tickets.filter((ticket) => ticket.ticket_status === status);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "emergency":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "normal":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "low":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage warranty claims and repair requests
          </p>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-5 gap-4 h-[calc(100vh-180px)]">
          {STATUSES.map((status) => {
            const statusTickets = getTicketsByStatus(status.id);
            const StatusIcon = status.icon;

            return (
              <div key={status.id} className="flex flex-col">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${status.color.replace("bg-", "text-")}`} />
                        <CardTitle className="text-sm font-semibold">
                          {status.label}
                        </CardTitle>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {statusTickets.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-3">
                    <Droppable droppableId={status.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-2 min-h-[100px] ${
                            snapshot.isDraggingOver ? "bg-muted/50 rounded" : ""
                          }`}
                        >
                          {statusTickets.map((ticket, index) => (
                            <Draggable
                              key={ticket.id}
                              draggableId={ticket.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <Link href={`/service-tickets/${ticket.id}`}>
                                  <Card
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`cursor-pointer hover:shadow-md transition-shadow ${
                                      snapshot.isDragging ? "shadow-lg" : ""
                                    }`}
                                  >
                                    <CardContent className="p-3">
                                      <div className="space-y-2">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                              {ticket.homeowner_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                              {ticket.issue_description.substring(0, 60)}
                                              {ticket.issue_description.length > 60 ? "..." : ""}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge
                                            variant="outline"
                                            className={`text-xs ${getPriorityColor(ticket.priority)}`}
                                          >
                                            {ticket.priority}
                                          </Badge>
                                          {ticket.is_warranty_covered && (
                                            <Badge variant="outline" className="text-xs">
                                              <Shield className="h-3 w-3 mr-1" />
                                              Covered
                                            </Badge>
                                          )}
                                          {ticket.should_charge_homeowner && (
                                            <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800">
                                              Charge
                                            </Badge>
                                          )}
                                        </div>

                                        {ticket.scheduled_date && (
                                          <p className="text-xs text-muted-foreground">
                                            Scheduled: {format(new Date(ticket.scheduled_date), "MMM d")}
                                          </p>
                                        )}

                                        {ticket.assignments?.[0]?.crew && (
                                          <p className="text-xs text-muted-foreground">
                                            Crew: {ticket.assignments[0].crew.name}
                                          </p>
                                        )}

                                        <p className="text-xs text-muted-foreground">
                                          {format(new Date(ticket.created_at), "MMM d, yyyy")}
                                        </p>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </Link>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}



























