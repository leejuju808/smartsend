"use client";

// Block 42000 — SmartSend Roofing Crew App v1
// Mobile page: Today's Jobs for Crew
// app/crew/today/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  MapPin, 
  Clock, 
  Camera, 
  Package, 
  CheckSquare, 
  FileText,
  Play,
  Pause,
  Square,
  AlertCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { offlineStorage, syncQueuedActions } from "@/lib/offline-storage";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { SafetyChecklistModal } from "@/components/crew/SafetyChecklistModal";

interface Job {
  id: string;
  job_id: string;
  job_title: string;
  address: string;
  scheduled_date: string;
  start_time?: string | null;
  scope_summary?: string | null;
  special_instructions?: string | null;
  required_photos: string[];
  materials_list: any[];
  roofing_jobs?: {
    id: string;
    title?: string | null;
    address?: string | null;
    notes?: string | null;
  };
}

interface JobStatus {
  job_id: string;
  is_started: boolean;
  is_paused: boolean;
  start_time?: string;
}

export default function CrewTodayPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({});
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [showSafetyChecklist, setShowSafetyChecklist] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      // Initialize offline storage
      await offlineStorage.init();
      
      const supabase = createClient();
      
      // Get current user's crew member ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: member } = await supabase
        .from("crew_members")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (member) {
        setMemberId(member.id);
        
        // Fetch today's jobs
        const isOnline = await offlineStorage.isOnline();
        if (isOnline) {
          const { data: jobsData, error } = await supabase
            .from("roofing_scheduled_jobs")
            .select(`
              id,
              job_id,
              start_date,
              start_time,
              roofing_jobs (
                id,
                title,
                address,
                notes
              )
            `)
            .eq("start_date", new Date().toISOString().split("T")[0])
            .order("start_time", { ascending: true });

          if (error) {
            console.error("Error fetching jobs:", error);
          } else if (jobsData) {
            const formattedJobs: Job[] = jobsData.map((j: any) => ({
              id: j.id,
              job_id: j.job_id,
              job_title: j.roofing_jobs?.title || "Untitled Job",
              address: j.roofing_jobs?.address || "No address",
              scheduled_date: j.start_date,
              start_time: j.start_time,
              scope_summary: j.roofing_jobs?.notes || null,
              special_instructions: null,
              required_photos: ["before", "during", "after"],
              materials_list: [],
              roofing_jobs: j.roofing_jobs,
            }));
            setJobs(formattedJobs);
          }
        }
      }
      
      setLoading(false);
      
      // Sync queued actions
      syncQueuedActions();
    }

    loadData();
    
    // Sync when coming back online
    window.addEventListener('online', syncQueuedActions);
    return () => window.removeEventListener('online', syncQueuedActions);
  }, [router]);

  const handleStartJob = async (jobId: string) => {
    if (!memberId) return;

    try {
      // Block 49000: Check if safety checklist is completed
      const isOnline = await offlineStorage.isOnline();
      
      if (isOnline) {
        const checklistResponse = await fetch(`/api/safety/checklist-status?job_id=${jobId}`);
        const checklistData = await checklistResponse.json();
        
        if (!checklistData.has_completed_checklist) {
          // Show safety checklist modal
          setPendingJobId(jobId);
          setShowSafetyChecklist(true);
          return;
        }
      }

      // Get GPS coordinates
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      const payload = {
        job_id: jobId,
        member_id: memberId,
        gps_latitude: position.coords.latitude,
        gps_longitude: position.coords.longitude,
      };

      if (isOnline) {
        const response = await fetch("/api/crew/jobs/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        
        if (data.code === "SAFETY_CHECKLIST_REQUIRED") {
          // Show safety checklist modal
          setPendingJobId(jobId);
          setShowSafetyChecklist(true);
          return;
        }
        
        if (data.success) {
          setJobStatuses((prev) => ({
            ...prev,
            [jobId]: {
              job_id: jobId,
              is_started: true,
              is_paused: false,
              start_time: new Date().toISOString(),
            },
          }));
        }
      } else {
        // Queue for offline sync
        await offlineStorage.queueAction({
          type: 'activity',
          endpoint: '/api/crew/jobs/start',
          method: 'POST',
          payload,
        });
        
        setJobStatuses((prev) => ({
          ...prev,
          [jobId]: {
            job_id: jobId,
            is_started: true,
            is_paused: false,
            start_time: new Date().toISOString(),
          },
        }));
        
        alert("Job started (offline). Will sync when online.");
      }
    } catch (error) {
      console.error("Error starting job:", error);
      alert("Failed to start job. Please try again.");
    }
  };

  const handleSafetyChecklistComplete = async () => {
    setShowSafetyChecklist(false);
    if (pendingJobId) {
      // Retry starting the job
      await handleStartJob(pendingJobId);
      setPendingJobId(null);
    }
  };

  const handleStopJob = async (jobId: string) => {
    if (!memberId) return;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      const payload = {
        job_id: jobId,
        member_id: memberId,
        gps_latitude: position.coords.latitude,
        gps_longitude: position.coords.longitude,
      };

      const isOnline = await offlineStorage.isOnline();
      
      if (isOnline) {
        const response = await fetch("/api/crew/jobs/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (data.success) {
          setJobStatuses((prev) => ({
            ...prev,
            [jobId]: {
              job_id: jobId,
              is_started: false,
              is_paused: false,
            },
          }));
        }
      } else {
        // Queue for offline sync
        await offlineStorage.queueAction({
          type: 'activity',
          endpoint: '/api/crew/jobs/stop',
          method: 'POST',
          payload,
        });
        
        setJobStatuses((prev) => ({
          ...prev,
          [jobId]: {
            job_id: jobId,
            is_started: false,
            is_paused: false,
          },
        }));
        
        alert("Job stopped (offline). Will sync when online.");
      }
    } catch (error) {
      console.error("Error stopping job:", error);
      alert("Failed to stop job. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="text-center py-8">
          <div className="text-gray-500">Loading today's jobs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Today's Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date().toLocaleDateString("en-US", { 
              weekday: "long", 
              year: "numeric", 
              month: "long", 
              day: "numeric" 
            })}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {jobs.length === 0 ? (
          <div className="bg-white rounded-lg p-6 text-center shadow-sm">
            <p className="text-gray-500">No jobs scheduled for today</p>
          </div>
        ) : (
          jobs.map((job) => {
            const status = jobStatuses[job.job_id];
            const isStarted = status?.is_started || false;

            return (
              <div
                key={job.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
              >
                {/* Job Header */}
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {job.job_title}
                  </h2>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    {job.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{job.address}</span>
                      </div>
                    )}

                    {job.start_time && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>Start: {job.start_time}</span>
                      </div>
                    )}

                    {job.scope_summary && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-500 mb-1">Scope:</div>
                        <div className="text-gray-700">{job.scope_summary}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="p-4 space-y-2">
                  {/* Start/Stop Controls */}
                  <div className="flex gap-2">
                    {!isStarted ? (
                      <button
                        onClick={() => handleStartJob(job.job_id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
                      >
                        <Play className="w-5 h-5" />
                        Start Job
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStopJob(job.job_id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
                      >
                        <Square className="w-5 h-5" />
                        Stop Job
                      </button>
                    )}
                  </div>

                  {/* Quick Actions Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => router.push(`/crew/job/${job.job_id}/photos`)}
                      className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-4 py-3 rounded-lg font-medium hover:bg-blue-100 transition-colors"
                    >
                      <Camera className="w-5 h-5" />
                      Photos
                    </button>
                    
                    <button
                      onClick={() => router.push(`/crew/job/${job.job_id}/materials`)}
                      className="flex items-center justify-center gap-2 bg-orange-50 text-orange-700 px-4 py-3 rounded-lg font-medium hover:bg-orange-100 transition-colors"
                    >
                      <Package className="w-5 h-5" />
                      Materials
                    </button>
                    
                    <button
                      onClick={() => router.push(`/crew/job/${job.job_id}/punch-list`)}
                      className="flex items-center justify-center gap-2 bg-purple-50 text-purple-700 px-4 py-3 rounded-lg font-medium hover:bg-purple-100 transition-colors"
                    >
                      <CheckSquare className="w-5 h-5" />
                      Punch List
                    </button>
                    
                    <button
                      onClick={() => router.push(`/crew/job/${job.job_id}/change-order`)}
                      className="flex items-center justify-center gap-2 bg-yellow-50 text-yellow-700 px-4 py-3 rounded-lg font-medium hover:bg-yellow-100 transition-colors"
                    >
                      <AlertCircle className="w-5 h-5" />
                      Change Order
                    </button>
                  </div>
                  
                  {/* AI Field Assistant Button */}
                  <button
                    onClick={() => router.push('/crew/ai')}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white px-4 py-3 rounded-lg font-semibold hover:from-orange-700 hover:to-orange-800 transition-colors shadow-md"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    💬 Ask SmartSend AI
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <OfflineIndicator />

      {/* Safety Checklist Modal */}
      {showSafetyChecklist && pendingJobId && memberId && (
        <SafetyChecklistModal
          jobId={pendingJobId}
          memberId={memberId}
          onComplete={handleSafetyChecklistComplete}
          onCancel={() => {
            setShowSafetyChecklist(false);
            setPendingJobId(null);
          }}
        />
      )}
    </div>
  );
}

