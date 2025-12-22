"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { RefreshCw, Send, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Get active workspace from cookie or localStorage
function getActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('activeWorkspaceId');
}

interface QueueItem {
  id: string;
  campaign_id?: string;
  workspace_id: string;
  user_id: string;
  contact_id?: string;
  email_lower: string;
  name?: string;
  company?: string;
  custom_fields: any;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'bounced' | 'unsubscribed';
  attempts: number;
  max_attempts: number;
  error?: string;
  sent_at?: string;
  scheduled_for: string;
  created_at: string;
}

export default function SendQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const wsId = getActiveWorkspaceId();
    setWorkspaceId(wsId);
    if (wsId) {
      fetchQueue(wsId);
    }
    
    // Set up real-time subscription for send_queue changes
    const channel = supabase
      .channel("send_queue_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "send_queue", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          console.log("Queue change detected:", payload);
          if (payload.eventType === 'INSERT' && payload.new) {
            setQueue((prev) => [...prev, payload.new as QueueItem]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setQueue((prev) => 
              prev.map((item) => 
                item.id === payload.new.id ? payload.new as QueueItem : item
              )
            );
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setQueue((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  // Refresh handler
  const handleRefresh = () => fetchQueue();

  async function fetchQueue(wsId?: string | null) {
    const workspaceId = wsId || getActiveWorkspaceId();
    if (!workspaceId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("send_queue")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("scheduled_for", { ascending: true })
        .limit(100); // Limit to prevent UI overload
      
      if (error) {
        console.error("Error fetching queue:", error);
      } else {
        setQueue(data || []);
      }
    } catch (error) {
      console.error("Error fetching queue:", error);
    } finally {
      setLoading(false);
    }
  }

  async function executeTask(taskId: string) {
    setExecuting(taskId);
    try {
      const { data, error } = await supabase.functions.invoke("execute_send", { 
        body: { taskId } 
      });
      
      if (error) {
        console.error("Error executing task:", error);
        // Update the task status to failed
        await supabase
          .from("send_queue")
          .update({ 
            status: 'failed', 
            error: error.message,
            attempts: supabase.rpc('increment_attempts', { task_id: taskId })
          })
          .eq("id", taskId);
      } else {
        // Remove from queue on success (the function should handle this)
        setQueue((prev) => prev.filter((q) => q.id !== taskId));
      }
    } catch (error) {
      console.error("Error executing task:", error);
    } finally {
      setExecuting(null);
    }
  }

  async function retryFailedTask(taskId: string) {
    setExecuting(taskId);
    try {
      await supabase
        .from("send_queue")
        .update({ 
          status: 'pending',
          error: null,
          scheduled_for: new Date().toISOString()
        })
        .eq("id", taskId);
      
      // Execute immediately after retry
      await executeTask(taskId);
    } catch (error) {
      console.error("Error retrying task:", error);
    } finally {
      setExecuting(null);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'sending':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'bounced':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'unsubscribed':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'sending':
        return 'bg-blue-100 text-blue-800';
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'bounced':
        return 'bg-orange-100 text-orange-800';
      case 'unsubscribed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const pendingCount = queue.filter(item => item.status === 'pending').length;
  const sendingCount = queue.filter(item => item.status === 'sending').length;
  const sentCount = queue.filter(item => item.status === 'sent').length;
  const failedCount = queue.filter(item => item.status === 'failed').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">📤 Send Queue</h2>
        <Button onClick={handleRefresh} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-gray-600">Sending</p>
                <p className="text-2xl font-bold text-blue-600">{sendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium text-gray-600">Sent</p>
                <p className="text-2xl font-bold text-green-600">{sentCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{failedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Items */}
      <Card>
        <CardHeader>
          <CardTitle>Queue Items ({queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
              <p className="text-gray-600 mt-2">Loading queue...</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No items in the send queue</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((task) => (
                <div
                  key={task.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {getStatusIcon(task.status)}
                        <div>
                          <p className="font-semibold text-gray-900">
                            {task.name || 'Unknown Contact'}
                          </p>
                          <p className="text-sm text-gray-600">{task.email_lower}</p>
                          {task.company && (
                            <p className="text-xs text-gray-500">{task.company}</p>
                          )}
                        </div>
                        <Badge className={getStatusColor(task.status)}>
                          {task.status}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Scheduled: {formatDate(task.scheduled_for)}</p>
                        {task.sent_at && (
                          <p>Sent: {formatDate(task.sent_at)}</p>
                        )}
                        {task.error && (
                          <p className="text-red-600">Error: {task.error}</p>
                        )}
                        <p>Attempts: {task.attempts}/{task.max_attempts}</p>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      {task.status === 'pending' && (
                        <Button
                          onClick={() => executeTask(task.id)}
                          disabled={executing === task.id}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          {executing === task.id ? 'Sending...' : 'Send Now'}
                        </Button>
                      )}
                      
                      {task.status === 'failed' && task.attempts < task.max_attempts && (
                        <Button
                          onClick={() => retryFailedTask(task.id)}
                          disabled={executing === task.id}
                          variant="outline"
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          {executing === task.id ? 'Retrying...' : 'Retry'}
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