"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { 
  Flame, 
  Clock, 
  Mail, 
  MessageSquare, 
  AlertTriangle, 
  TrendingUp,
  Calendar,
  FileText,
  Wind,
  Bell,
  CheckCircle2,
  Filter,
  X
} from "lucide-react";
import Link from "next/link";

interface Alert {
  id: string;
  type: 'hot_lead' | 'insurance_claim' | 'storm_damage' | 'appointment' | 'system_billing' | 'performance_insights';
  priority: 'priority_1' | 'priority_2' | 'priority_3' | 'priority_4' | 'priority_5';
  status: 'unread' | 'read' | 'archived' | 'dismissed';
  title: string;
  message: string;
  icon: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  appointment_id: string | null;
  recommended_actions: Array<{ action: string; label: string }>;
  action_taken: Record<string, any> | null;
  created_at: string;
  read_at: string | null;
  contact?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  campaign?: {
    id: string;
    name: string;
  };
  appointment?: {
    id: string;
    start_time: string;
    homeowner_name: string;
  };
}

const ALERT_TYPE_CONFIG = {
  hot_lead: { 
    label: 'Hot Lead', 
    icon: Flame, 
    color: 'text-red-600 bg-red-50',
    priorityColor: 'border-red-500'
  },
  insurance_claim: { 
    label: 'Insurance', 
    icon: FileText, 
    color: 'text-blue-600 bg-blue-50',
    priorityColor: 'border-blue-500'
  },
  storm_damage: { 
    label: 'Storm Damage', 
    icon: Wind, 
    color: 'text-purple-600 bg-purple-50',
    priorityColor: 'border-purple-500'
  },
  appointment: { 
    label: 'Appointment', 
    icon: Calendar, 
    color: 'text-green-600 bg-green-50',
    priorityColor: 'border-green-500'
  },
  system_billing: { 
    label: 'System', 
    icon: AlertTriangle, 
    color: 'text-orange-600 bg-orange-50',
    priorityColor: 'border-orange-500'
  },
  performance_insights: { 
    label: 'Performance', 
    icon: TrendingUp, 
    color: 'text-indigo-600 bg-indigo-50',
    priorityColor: 'border-indigo-500'
  },
};

export default function AlertsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread' | string>('unread');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get workspace ID from cookie or user profile
      const workspaceId = document.cookie
        .split('; ')
        .find(row => row.startsWith('ws='))
        ?.split('=')[1];

      if (!workspaceId) {
        console.error('No workspace ID found');
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          status: filter === 'all' ? 'all' : 'unread',
          limit: '100',
        });
        if (typeFilter) {
          params.append('type', typeFilter);
        }

        const response = await fetch(`/api/alerts/list?${params}`);
        const data = await response.json();

        if (data.alerts) {
          setAlerts(data.alerts);
          setUnreadCount(data.unread_count || 0);
        }
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
      setLoading(false);
    };

    fetchAlerts();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("alerts_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts",
        },
        () => {
          fetchAlerts();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alerts",
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, filter, typeFilter]);

  const markAsRead = async (alertId: string) => {
    try {
      await fetch('/api/alerts/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId }),
      });
      setAlerts(alerts.map(a => 
        a.id === alertId ? { ...a, status: 'read' as const, read_at: new Date().toISOString() } : a
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Failed to mark alert as read:', error);
    }
  };

  const handleAction = async (alertId: string, action: string) => {
    try {
      await fetch('/api/alerts/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          alert_id: alertId,
          action_taken: { action, timestamp: new Date().toISOString() }
        }),
      });

      // Navigate based on action
      const alert = alerts.find(a => a.id === alertId);
      if (!alert) return;

      switch (action) {
        case 'reply':
          if (alert.contact_id) {
            router.push(`/contacts/${alert.contact_id}`);
          }
          break;
        case 'move_pipeline':
          if (alert.contact_id) {
            router.push(`/contacts/${alert.contact_id}?action=move`);
          }
          break;
        case 'book_appointment':
          router.push('/scheduler/book');
          break;
        case 'view_appointment':
          if (alert.appointment_id) {
            router.push(`/scheduler/appointments/${alert.appointment_id}`);
          }
          break;
        case 'send_template':
          if (alert.contact_id) {
            router.push(`/contacts/${alert.contact_id}?action=send_template`);
          }
          break;
      }

      markAsRead(alertId);
    } catch (error) {
      console.error('Failed to handle action:', error);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'unread' && alert.status !== 'unread') return false;
    if (typeFilter && alert.type !== typeFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading alerts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Bell className="h-8 w-8 text-gray-900" />
                SmartSend Alerts
              </h1>
              <p className="text-gray-600 mt-2">
                Real-time intelligence for hot leads, insurance claims, storm damage & more
              </p>
            </div>
            {unreadCount > 0 && (
              <div className="bg-red-600 text-white px-4 py-2 rounded-full font-semibold">
                {unreadCount} unread
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === 'unread' 
                    ? 'bg-gray-900 text-white' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Unread ({unreadCount})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === 'all' 
                    ? 'bg-gray-900 text-white' 
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                All ({alerts.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={typeFilter || ''}
                onChange={(e) => setTypeFilter(e.target.value || null)}
                className="bg-white border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">All Types</option>
                {Object.entries(ALERT_TYPE_CONFIG).map(([type, config]) => (
                  <option key={type} value={type}>{config.label}</option>
                ))}
              </select>
              {typeFilter && (
                <button
                  onClick={() => setTypeFilter(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Alerts List */}
        {filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Bell className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {filter === 'unread' ? 'No unread alerts' : 'No alerts yet'}
            </h2>
            <p className="text-gray-600">
              {filter === 'unread' 
                ? 'You\'re all caught up! New alerts will appear here.'
                : 'When important events happen, you\'ll see alerts here instantly.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => {
              const config = ALERT_TYPE_CONFIG[alert.type];
              const Icon = config.icon;
              const isUnread = alert.status === 'unread';
              const contactName = alert.contact 
                ? `${alert.contact.first_name || ''} ${alert.contact.last_name || ''}`.trim() || alert.contact.email
                : null;

              return (
                <div
                  key={alert.id}
                  className={`bg-white rounded-lg shadow-sm border-l-4 ${
                    isUnread ? config.priorityColor : 'border-gray-300'
                  } p-6 hover:shadow-md transition-shadow ${
                    isUnread ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${config.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {alert.title}
                            </h3>
                            {isUnread && (
                              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                        </div>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(alert.created_at)}
                        </span>
                      </div>

                      {/* Contact/Campaign Info */}
                      {(contactName || alert.campaign || alert.appointment) && (
                        <div className="ml-14 mb-3 text-sm text-gray-600">
                          {contactName && (
                            <span className="font-medium">{contactName}</span>
                          )}
                          {alert.campaign && (
                            <span className="text-gray-500"> • Campaign: {alert.campaign.name}</span>
                          )}
                          {alert.appointment && (
                            <span className="text-gray-500">
                              {' • '}
                              Appointment: {new Date(alert.appointment.start_time).toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Recommended Actions */}
                      {alert.recommended_actions && alert.recommended_actions.length > 0 && (
                        <div className="ml-14 flex items-center gap-2 flex-wrap">
                          {alert.recommended_actions.map((action, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleAction(alert.id, action.action)}
                              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium transition-colors"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="ml-4 flex items-center gap-2">
                      {isUnread && (
                        <button
                          onClick={() => markAsRead(alert.id)}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Mark as read"
                        >
                          <CheckCircle2 className="h-5 w-5" />
                        </button>
                      )}
                      {alert.contact_id && (
                        <Link
                          href={`/contacts/${alert.contact_id}`}
                          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                          View Contact
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
