// Block 21350 — SmartSend SmartQueue v1
// SmartQueue Panel Component — Your Daily Money List

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  RefreshCw, 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  Phone,
  Mail,
  FileText,
  Calendar,
  AlertCircle,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export type SmartQueueItem = {
  id: string;
  workspaceId: string;
  userId?: string;
  sourceType: string;
  sourceId?: string;
  taskCategory: 'high_roi' | 'medium_roi' | 'low_roi';
  taskType: string;
  title: string;
  description?: string;
  reason?: string;
  contactId?: string;
  leadId?: string;
  threadId?: string;
  proposalId?: string;
  priorityScore: number;
  scoreBreakdown?: Record<string, any>;
  actionButtons?: Array<{
    label: string;
    action: string;
    url: string;
  }>;
  dueAt: string;
  dueDate?: string;
  status: 'active' | 'completed' | 'dismissed' | 'snoozed';
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

type SmartQueuePanelProps = {
  role?: 'owner' | 'sales_rep' | 'office_staff' | 'adjuster_helper';
  userId?: string;
  showMoneyMode?: boolean;
};

export function SmartQueuePanel({ 
  role, 
  userId,
  showMoneyMode = false 
}: SmartQueuePanelProps) {
  const [items, setItems] = useState<SmartQueueItem[]>([]);
  const [grouped, setGrouped] = useState<{
    high_roi: SmartQueueItem[];
    medium_roi: SmartQueueItem[];
    low_roi: SmartQueueItem[];
  }>({
    high_roi: [],
    medium_roi: [],
    low_roi: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moneyMode, setMoneyMode] = useState(showMoneyMode);

  const loadSmartQueue = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (role) params.append('role', role);
      if (userId) params.append('user_id', userId);
      if (moneyMode) params.append('money_mode', 'true');

      const res = await fetch(`/api/smartqueue?${params.toString()}`);
      const data = await res.json();
      
      setItems(data.items || []);
      setGrouped(data.grouped || {
        high_roi: [],
        medium_roi: [],
        low_roi: [],
      });
    } catch (error) {
      console.error('Failed to load SmartQueue:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshSmartQueue = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/smartqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', user_id: userId }),
      });
      await loadSmartQueue();
    } catch (error) {
      console.error('Failed to refresh SmartQueue:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const completeItem = async (itemId: string) => {
    try {
      await fetch(`/api/smartqueue/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      await loadSmartQueue();
    } catch (error) {
      console.error('Failed to complete item:', error);
    }
  };

  useEffect(() => {
    loadSmartQueue();
    // Refresh every 5 minutes
    const interval = setInterval(loadSmartQueue, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [role, userId, moneyMode]);

  if (loading && items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SmartQueue — Your Daily Money List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading SmartQueue...</div>
        </CardContent>
      </Card>
    );
  }

  const totalItems = items.length;
  const highRoiCount = grouped.high_roi.length;
  const mediumRoiCount = grouped.medium_roi.length;
  const lowRoiCount = grouped.low_roi.length;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">
              SmartQueue — Your Daily Money List
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              {moneyMode 
                ? '💰 Money Mode: High ROI actions only'
                : `${totalItems} total actions • ${highRoiCount} high ROI • ${mediumRoiCount} medium • ${lowRoiCount} low`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoneyMode(!moneyMode)}
              className={moneyMode ? 'bg-yellow-50 border-yellow-300' : ''}
            >
              <DollarSign className="h-4 w-4 mr-1" />
              {moneyMode ? 'All Tasks' : 'Money Mode'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshSmartQueue}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* High ROI Section */}
        {(!moneyMode || grouped.high_roi.length > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-red-600" />
                <h3 className="font-semibold text-base text-red-700">
                  🔥 HIGH PRIORITY
                </h3>
              </div>
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                {grouped.high_roi.length}
              </Badge>
            </div>
            {grouped.high_roi.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 border border-dashed rounded-lg text-center">
                No high ROI actions right now. Check back soon!
              </div>
            ) : (
              <div className="space-y-2">
                {grouped.high_roi.map((item) => (
                  <SmartQueueItemCard
                    key={item.id}
                    item={item}
                    onComplete={() => completeItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Medium ROI Section */}
        {!moneyMode && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <h3 className="font-semibold text-base text-yellow-700">
                  📄 MEDIUM PRIORITY
                </h3>
              </div>
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                {grouped.medium_roi.length}
              </Badge>
            </div>
            {grouped.medium_roi.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 border border-dashed rounded-lg text-center">
                No medium priority actions.
              </div>
            ) : (
              <div className="space-y-2">
                {grouped.medium_roi.map((item) => (
                  <SmartQueueItemCard
                    key={item.id}
                    item={item}
                    onComplete={() => completeItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Low ROI Section */}
        {!moneyMode && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold text-base text-gray-600">
                  🧹 LOW PRIORITY
                </h3>
              </div>
              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300">
                {grouped.low_roi.length}
              </Badge>
            </div>
            {grouped.low_roi.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 border border-dashed rounded-lg text-center">
                No low priority actions.
              </div>
            ) : (
              <div className="space-y-2">
                {grouped.low_roi.map((item) => (
                  <SmartQueueItemCard
                    key={item.id}
                    item={item}
                    onComplete={() => completeItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {totalItems === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No actions in SmartQueue right now.</p>
            <p className="text-xs mt-1">SmartQueue refreshes automatically when new tasks are created.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmartQueueItemCard({ 
  item, 
  onComplete 
}: { 
  item: SmartQueueItem; 
  onComplete: () => void;
}) {
  const isOverdue = new Date(item.dueAt) < new Date();
  const dueDate = new Date(item.dueAt);
  
  const getTaskIcon = () => {
    switch (item.taskType) {
      case 'install_ready_call':
      case 'next_best_action':
        return <Phone className="h-4 w-4" />;
      case 'proposal_followup':
        return <Mail className="h-4 w-4" />;
      case 'supplement_request':
        return <FileText className="h-4 w-4" />;
      case 'calendar_event':
        return <Calendar className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getTaskTypeColor = () => {
    switch (item.taskCategory) {
      case 'high_roi':
        return 'border-red-300 bg-red-50';
      case 'medium_roi':
        return 'border-yellow-300 bg-yellow-50';
      case 'low_roi':
        return 'border-gray-300 bg-gray-50';
      default:
        return 'border-gray-300 bg-white';
    }
  };

  return (
    <div className={`border rounded-lg p-3 ${getTaskTypeColor()} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 text-gray-600">
              {getTaskIcon()}
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm leading-tight">{item.title}</h4>
              {item.reason && (
                <p className="text-xs text-gray-600 mt-1">
                  Reason: {item.reason}
                </p>
              )}
              {item.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {item.description}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                {isOverdue ? 'Overdue' : formatDistanceToNow(dueDate, { addSuffix: true })}
              </span>
            </div>
            {item.priorityScore > 0 && (
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                <span className="font-semibold">Score: {Math.round(item.priorityScore)}</span>
              </div>
            )}
            {item.sourceType && (
              <Badge variant="outline" className="text-[10px]">
                {item.sourceType.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          {item.actionButtons && item.actionButtons.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              {item.actionButtons.map((button, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    if (button.action === 'complete') {
                      onComplete();
                    } else {
                      window.open(button.url, '_blank');
                    }
                  }}
                >
                  {button.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onComplete}
          className="text-gray-400 hover:text-green-600"
          title="Mark as done"
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
















































