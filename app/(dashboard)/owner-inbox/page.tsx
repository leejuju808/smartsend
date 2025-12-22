/**
 * Block 24780 — SmartSend Roofing Owner Inbox v2
 * Owner-Only View • High-Priority Escalations • Financial Alerts
 */

"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  AlertCircle, 
  DollarSign, 
  AlertTriangle, 
  Users, 
  Truck, 
  TrendingUp, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Phone,
  Mail,
  UserPlus,
  FileText
} from "lucide-react";

type OwnerInboxItem = {
  id: string;
  workspace_id: string;
  owner_id: string;
  message_type: 'financial_alert' | 'job_risk_alert' | 'crew_problem' | 'supplier_problem' | 'high_value_opportunity' | 'leadership_decision_needed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string | null;
  related_job_id: string | null;
  related_lead_id: string | null;
  related_crew_id: string | null;
  related_supplier_id: string | null;
  related_invoice_id: string | null;
  related_payment_id: string | null;
  action_type: string | null;
  action_url: string | null;
  status: 'new' | 'acknowledged' | 'resolved' | 'dismissed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  escalated_at: string;
  related_job?: { id: string; title: string; job_value: number; status: string } | null;
  related_lead?: { id: string; email: string; first_name: string; last_name: string } | null;
  related_crew?: { id: string; name: string } | null;
  related_supplier?: { id: string; name: string } | null;
  related_invoice?: { id: string; amount: number; status: string } | null;
  related_payment?: { id: string; amount: number } | null;
};

type PriorityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

const PRIORITY_COLORS = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-green-500 text-white",
};

const MESSAGE_TYPE_ICONS = {
  financial_alert: DollarSign,
  job_risk_alert: AlertTriangle,
  crew_problem: Users,
  supplier_problem: Truck,
  high_value_opportunity: TrendingUp,
  leadership_decision_needed: MessageSquare,
};

const MESSAGE_TYPE_LABELS = {
  financial_alert: "Financial Alert",
  job_risk_alert: "Job Risk",
  crew_problem: "Crew Problem",
  supplier_problem: "Supplier Problem",
  high_value_opportunity: "Opportunity",
  leadership_decision_needed: "Decision Needed",
};

export default function OwnerInboxPage() {
  const [items, setItems] = useState<OwnerInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [messageTypeFilter, setMessageTypeFilter] = useState<string | null>(null);
  const [counts, setCounts] = useState<PriorityCounts>({ critical: 0, high: 0, medium: 0, low: 0 });

  useEffect(() => {
    fetchItems();
    // Refresh every 30 seconds
    const interval = setInterval(fetchItems, 30000);
    return () => clearInterval(interval);
  }, [filter, messageTypeFilter]);

  const fetchItems = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('priority', filter);
      }
      if (messageTypeFilter) {
        params.append('message_type', messageTypeFilter);
      }

      const response = await fetch(`/api/owner-inbox?${params.toString()}`);
      const data = await response.json();
      
      setItems(data.items || []);
      setCounts(data.counts?.by_priority || { critical: 0, high: 0, medium: 0, low: 0 });
    } catch (error) {
      console.error('Error fetching owner inbox items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (itemId: string, action: 'resolve' | 'dismiss' | 'acknowledge') => {
    try {
      const response = await fetch('/api/owner-inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action }),
      });

      if (response.ok) {
        fetchItems();
      }
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  const filteredItems = items.filter(item => {
    if (filter !== 'all' && item.priority !== filter) return false;
    if (messageTypeFilter && item.message_type !== messageTypeFilter) return false;
    return true;
  });

  const getPriorityBadge = (priority: string) => {
    return (
      <Badge className={PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS]}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  const getMessageTypeIcon = (type: string) => {
    const Icon = MESSAGE_TYPE_ICONS[type as keyof typeof MESSAGE_TYPE_ICONS] || AlertCircle;
    return <Icon className="h-4 w-4" />;
  };

  const getActionButton = (actionType: string | null, actionUrl: string | null) => {
    if (!actionType || !actionUrl) return null;

    const actionLabels: Record<string, string> = {
      assign_to_manager: "Assign to Manager",
      call_homeowner: "Call Homeowner",
      message_crew_lead: "Message Crew Lead",
      contact_supplier: "Contact Supplier",
      resolve_and_watch: "Resolve & Watch",
      create_task: "Create Task",
    };

    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(actionUrl, '_blank')}
        className="gap-2"
      >
        {actionLabels[actionType] || actionType}
        <ExternalLink className="h-3 w-3" />
      </Button>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Owner Inbox</h1>
          <p className="text-muted-foreground mt-1">
            High-priority escalations • Financial alerts • Crew & supplier problems
          </p>
        </div>
        <Button onClick={fetchItems} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Priority Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-500">{counts.critical}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High</p>
                <p className="text-2xl font-bold text-orange-500">{counts.high}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Medium</p>
                <p className="text-2xl font-bold text-yellow-500">{counts.medium}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low</p>
                <p className="text-2xl font-bold text-green-500">{counts.low}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="critical">Critical ({counts.critical})</TabsTrigger>
          <TabsTrigger value="high">High ({counts.high})</TabsTrigger>
          <TabsTrigger value="medium">Medium ({counts.medium})</TabsTrigger>
          <TabsTrigger value="low">Low ({counts.low})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Message Type Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={messageTypeFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setMessageTypeFilter(null)}
        >
          All Types
        </Button>
        {Object.entries(MESSAGE_TYPE_LABELS).map(([type, label]) => (
          <Button
            key={type}
            variant={messageTypeFilter === type ? "default" : "outline"}
            size="sm"
            onClick={() => setMessageTypeFilter(type)}
            className="gap-2"
          >
            {getMessageTypeIcon(type)}
            {label}
          </Button>
        ))}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">All Clear!</h3>
            <p className="text-muted-foreground">
              No items match your current filters. Everything is under control.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getMessageTypeIcon(item.message_type)}
                      <span className="text-sm font-medium text-muted-foreground">
                        {MESSAGE_TYPE_LABELS[item.message_type]}
                      </span>
                      {getPriorityBadge(item.priority)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                    
                    {/* Related Entity Info */}
                    <div className="flex gap-4 text-sm text-muted-foreground mt-4">
                      {item.related_job && (
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          <span>Job: {item.related_job.title}</span>
                          {item.related_job.job_value && (
                            <span className="font-medium">${item.related_job.job_value.toLocaleString()}</span>
                          )}
                        </div>
                      )}
                      {item.related_crew && (
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>Crew: {item.related_crew.name}</span>
                        </div>
                      )}
                      {item.related_supplier && (
                        <div className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          <span>Supplier: {item.related_supplier.name}</span>
                        </div>
                      )}
                      {item.related_lead && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span>
                            {item.related_lead.first_name} {item.related_lead.last_name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {getActionButton(item.action_type, item.action_url)}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(item.id, 'resolve')}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Resolve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(item.id, 'dismiss')}
                        className="gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}






































