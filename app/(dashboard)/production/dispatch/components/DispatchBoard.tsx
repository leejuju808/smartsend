"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Navigation,
  Camera,
  Filter
} from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

interface DispatchItem {
  assignment_id: string;
  job_id: string;
  job_title: string;
  lead_name: string;
  address: string;
  crew_id: string;
  crew_name: string;
  scheduled_date: string;
  arrival_time_planned: string | null;
  arrival_time_actual: string | null;
  status: string;
  contract_value: number | null;
}

interface DispatchBoardProps {
  teamId: string;
  initialDispatch: DispatchItem[];
  crews: Array<{ id: string; name: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  Scheduled: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "En Route": "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  "On Site": "bg-green-500/20 text-green-300 border-green-500/40",
  Completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "No Show": "bg-red-500/20 text-red-300 border-red-500/40",
  Delayed: "bg-orange-500/20 text-orange-300 border-orange-500/40",
};

const STATUS_ICONS: Record<string, any> = {
  Scheduled: Clock,
  "En Route": Navigation,
  "On Site": CheckCircle2,
  Completed: CheckCircle2,
  "No Show": XCircle,
  Delayed: AlertCircle,
};

export function DispatchBoard({ teamId, initialDispatch, crews }: DispatchBoardProps) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCrew, setSelectedCrew] = useState<string>("all");
  const [dispatch, setDispatch] = useState<DispatchItem[]>(initialDispatch);
  const [loading, setLoading] = useState(false);

  const loadDispatch = async (date: string, crewId?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_todays_dispatch', {
        p_team_id: teamId,
        p_date: date
      });

      if (error) throw error;

      let filtered = data || [];
      if (crewId && crewId !== "all") {
        filtered = filtered.filter((item: DispatchItem) => item.crew_id === crewId);
      }

      setDispatch(filtered);
    } catch (error) {
      console.error('Error loading dispatch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDispatch(selectedDate, selectedCrew);
  }, [selectedDate, selectedCrew, teamId]);

  const handleStatusChange = async (assignmentId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('crew_assignments')
        .update({ 
          status: newStatus,
          ...(newStatus === 'On Site' && !dispatch.find(d => d.assignment_id === assignmentId)?.arrival_time_actual && {
            arrival_time_actual: new Date().toTimeString().slice(0, 5)
          })
        })
        .eq('id', assignmentId);

      if (error) throw error;

      // Reload dispatch
      await loadDispatch(selectedDate, selectedCrew);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatTime = (time: string | null) => {
    if (!time) return 'Not set';
    return time;
  };

  const groupedByStatus = dispatch.reduce((acc, item) => {
    if (!acc[item.status]) {
      acc[item.status] = [];
    }
    acc[item.status].push(item);
    return acc;
  }, {} as Record<string, DispatchItem[]>);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Dispatch Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            See who's going where each day • Track crew status in real-time
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="crew">Filter by Crew</Label>
              <Select value={selectedCrew} onValueChange={setSelectedCrew}>
                <SelectTrigger id="crew" className="mt-1">
                  <SelectValue placeholder="All Crews" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Crews</SelectItem>
                  {crews.map((crew) => (
                    <SelectItem key={crew.id} value={crew.id}>
                      {crew.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{dispatch.length}</div>
            <div className="text-sm text-muted-foreground">Total Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-500">
              {dispatch.filter(d => d.status === 'Completed').length}
            </div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-500">
              {dispatch.filter(d => d.status === 'On Site' || d.status === 'En Route').length}
            </div>
            <div className="text-sm text-muted-foreground">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-500">
              {dispatch.filter(d => d.status === 'Scheduled').length}
            </div>
            <div className="text-sm text-muted-foreground">Scheduled</div>
          </CardContent>
        </Card>
      </div>

      {/* Dispatch List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : dispatch.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-8 text-muted-foreground">
            No jobs scheduled for {format(new Date(selectedDate), 'MMM d, yyyy')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByStatus).map(([status, items]) => {
            const StatusIcon = STATUS_ICONS[status] || Clock;
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon className="h-4 w-4" />
                  <h3 className="font-semibold">{status}</h3>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <div className="grid gap-4">
                  {items.map((item) => (
                    <Card key={item.assignment_id} className="hover:bg-zinc-900/50 transition-colors">
                      <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-semibold">{item.lead_name}</h4>
                                <p className="text-sm text-muted-foreground">{item.job_title}</p>
                              </div>
                              <Badge className={STATUS_COLORS[item.status] || ""}>
                                {item.status}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>{item.address || 'No address'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{item.crew_name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>
                                  Planned: {formatTime(item.arrival_time_planned)}
                                  {item.arrival_time_actual && ` • Actual: ${formatTime(item.arrival_time_actual)}`}
                                </span>
                              </div>
                              {item.contract_value && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium text-green-400">
                                    {formatCurrency(item.contract_value)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              {item.status === 'Scheduled' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(item.assignment_id, 'En Route')}
                                >
                                  <Navigation className="h-3 w-3 mr-1" />
                                  En Route
                                </Button>
                              )}
                              {item.status === 'En Route' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(item.assignment_id, 'On Site')}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  On Site
                                </Button>
                              )}
                              {item.status === 'On Site' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(item.assignment_id, 'Completed')}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Complete
                                </Button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => router.push(`/production/jobs/${item.job_id}`)}
                              >
                                View Job
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => router.push(`/production/jobs/${item.job_id}?tab=photos`)}
                              >
                                <Camera className="h-3 w-3 mr-1" />
                                Photos
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



























