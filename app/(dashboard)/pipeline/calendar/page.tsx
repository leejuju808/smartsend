"use client";

// Block 170000 — Production Calendar for Job Pipeline
// Calendar view showing all jobs with production dates

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Users,
  Building2,
  Filter,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  isSameDay,
  isSameMonth,
  parseISO,
  eachDayOfInterval,
} from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { JobDetailsDrawer } from "../components/JobDetailsDrawer";
import Link from "next/link";

interface Job {
  id: string;
  homeowner_name: string | null;
  address: string | null;
  production_date: string | null;
  crew_name: string | null;
  stage_name: string | null;
  estimated_value: number | null;
  final_value: number | null;
  progress: number;
  job_type: string | null;
  insurance_claim: boolean;
  stage_id: string;
}

type ViewType = "month" | "week";

export default function PipelineCalendarPage() {
  const supabase = createClientComponentClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("month");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [crews, setCrews] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCrew, setSelectedCrew] = useState<string>("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompany();
  }, []);

  useEffect(() => {
    if (companyId) {
      loadJobs();
      loadCrews();
    }
  }, [companyId, currentDate, selectedCrew, selectedStage]);

  const loadCompany = async () => {
    try {
      // Get user's first active company
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("roofing_company_members")
        .select("roofing_company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (membership?.roofing_company_id) {
        setCompanyId(membership.roofing_company_id);
      }
    } catch (error) {
      console.error('Error loading company:', error);
    }
  };

  const loadJobs = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data: jobsData } = await supabase
        .from('jobs')
        .select(`
          id,
          homeowner_name,
          address,
          production_date,
          progress,
          estimated_value,
          final_value,
          job_type,
          insurance_claim,
          stage_id,
          job_stages:stage_id (name),
          crews:crew_id (name)
        `)
        .eq('company_id', companyId)
        .not('production_date', 'is', null);

      if (jobsData) {
        let filtered = jobsData.map((job: any) => ({
          id: job.id,
          homeowner_name: job.homeowner_name,
          address: job.address,
          production_date: job.production_date,
          crew_name: job.crews?.name || null,
          stage_name: job.job_stages?.name || null,
          estimated_value: job.estimated_value,
          final_value: job.final_value,
          progress: job.progress,
          job_type: job.job_type,
          insurance_claim: job.insurance_claim,
          stage_id: job.stage_id,
        }));

        if (selectedCrew !== 'all') {
          filtered = filtered.filter((job: Job) => {
            // Filter by crew - would need to join properly
            return true;
          });
        }

        if (selectedStage !== 'all') {
          filtered = filtered.filter((job: Job) => job.stage_id === selectedStage);
        }

        setJobs(filtered);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCrews = async () => {
    if (!companyId) return;
    const { data: crewsData } = await supabase
      .from('crews')
      .select('id, name')
      .eq('roofing_company_id', companyId)
      .eq('is_active', true)
      .order('name');

    if (crewsData) setCrews(crewsData);
  };

  const getJobsForDate = (date: Date): Job[] => {
    return jobs.filter((job) => {
      if (!job.production_date) return false;
      const jobDate = parseISO(job.production_date);
      return isSameDay(jobDate, date);
    });
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const weekStart = startOfWeek(currentDate);
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart),
  });

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (view === 'month') {
      setCurrentDate(
        direction === 'prev'
          ? addMonths(currentDate, -1)
          : addMonths(currentDate, 1)
      );
    } else {
      setCurrentDate(
        direction === 'prev'
          ? addWeeks(currentDate, -1)
          : addWeeks(currentDate, 1)
      );
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage jobs scheduled for production
          </p>
        </div>
        <Link href="/pipeline">
          <Button variant="outline">Back to Pipeline</Button>
        </Link>
      </div>

      {/* Filters and Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateDate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigateDate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="font-semibold ml-4">
            {view === 'month'
              ? format(currentDate, 'MMMM yyyy')
              : `Week of ${format(weekStart, 'MMM d')}`}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Select value={view} onValueChange={(v) => setView(v as ViewType)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="week">Week</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCrew} onValueChange={setSelectedCrew}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by crew" />
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

      {/* Calendar Grid */}
      {view === 'month' ? (
        <div className="border rounded-lg">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="p-2 text-center text-sm font-medium">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const dayJobs = getJobsForDate(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={index}
                  className={`min-h-[120px] border-r border-b p-2 ${
                    !isCurrentMonth ? 'bg-muted/30' : ''
                  } ${isToday ? 'bg-primary/5' : ''}`}
                >
                  <div
                    className={`text-sm font-medium mb-1 ${
                      isToday ? 'text-primary' : ''
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayJobs.slice(0, 3).map((job) => (
                      <Card
                        key={job.id}
                        className="p-2 cursor-pointer hover:bg-muted"
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="text-xs font-medium truncate">
                          {job.homeowner_name || 'Unknown'}
                        </div>
                        {job.crew_name && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {job.crew_name}
                          </div>
                        )}
                        {(job.estimated_value || job.final_value) && (
                          <div className="text-xs font-semibold text-primary">
                            {formatCurrency(job.final_value || job.estimated_value)}
                          </div>
                        )}
                      </Card>
                    ))}
                    {dayJobs.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{dayJobs.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {weekDays.map((day) => {
              const dayJobs = getJobsForDate(day);
              const isToday = isSameDay(day, new Date());

              return (
                <div key={day.toString()} className="border-r p-4">
                  <div className={`font-semibold mb-2 ${isToday ? 'text-primary' : ''}`}>
                    {format(day, 'EEE M/d')}
                  </div>
                  <div className="space-y-2">
                    {dayJobs.map((job) => (
                      <Card
                        key={job.id}
                        className="p-3 cursor-pointer hover:bg-muted"
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="font-medium text-sm">
                          {job.homeowner_name || 'Unknown'}
                        </div>
                        {job.address && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {job.address}
                          </div>
                        )}
                        {job.crew_name && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Users className="h-3 w-3" />
                            {job.crew_name}
                          </div>
                        )}
                        {(job.estimated_value || job.final_value) && (
                          <div className="text-xs font-semibold text-primary mt-1">
                            {formatCurrency(job.final_value || job.estimated_value)}
                          </div>
                        )}
                        {job.progress > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {job.progress}% complete
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job Details Drawer */}
      {selectedJob && (
        <JobDetailsDrawer
          job={selectedJob as any}
          companyId={companyId || ''}
          onClose={() => setSelectedJob(null)}
          onUpdate={loadJobs}
        />
      )}
    </div>
  );
}


























