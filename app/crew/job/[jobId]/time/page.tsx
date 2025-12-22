"use client";

// Block 251600 — SmartSend Workforce Hub v1
// Crew Time Tracking Page with GPS Validation
// app/crew/job/[jobId]/time/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface TimeClockEntry {
  id: string;
  job_id: string;
  employee_id: string;
  clock_in: string;
  clock_in_lat: number;
  clock_in_lng: number;
  clock_out: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  duration_minutes: number | null;
  created_at: string;
}

interface Job {
  id: string;
  site_lat: number | null;
  site_lng: number | null;
  notes: string | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

export default function CrewTimeTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<Job | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [activeClock, setActiveClock] = useState<TimeClockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [timer, setTimer] = useState<number>(0);

  useEffect(() => {
    loadData();
    getCurrentLocation();
    
    // Set up timer interval if clocked in
    const interval = setInterval(() => {
      if (activeClock) {
        const startTime = new Date(activeClock.clock_in).getTime();
        const now = Date.now();
        setTimer(Math.floor((now - startTime) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [jobId, activeClock]);

  const loadData = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Get job details
      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select("id, site_lat, site_lng, notes")
        .eq("id", jobId)
        .single();

      if (jobError || !jobData) {
        setError("Job not found");
        setLoading(false);
        return;
      }

      setJob(jobData);

      // Get employee for current user
      const { data: employeeData, error: empError } = await supabase
        .from("workforce_employees")
        .select("id, first_name, last_name")
        .eq("email", user.email)
        .eq("status", "active")
        .single();

      if (empError || !employeeData) {
        setError("Employee profile not found");
        setLoading(false);
        return;
      }

      setEmployee(employeeData);

      // Get active clock-in if exists
      const { data: clockData, error: clockError } = await supabase
        .from("crew_time_clock")
        .select("*")
        .eq("employee_id", employeeData.id)
        .eq("job_id", jobId)
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .single();

      if (clockData) {
        setActiveClock(clockData);
        const startTime = new Date(clockData.clock_in).getTime();
        const now = Date.now();
        setTimer(Math.floor((now - startTime) / 1000));
      }

      setLoading(false);
    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationError(null);
      },
      (err) => {
        setLocationError(`Location error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleClockIn = async () => {
    if (!location || !employee || !job) {
      setError("Location or employee data missing");
      return;
    }

    if (!job.site_lat || !job.site_lng) {
      setError("Job site location not configured. Please contact your manager.");
      return;
    }

    setClocking(true);
    setError(null);

    try {
      const response = await fetch("/api/workforce/time/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employee.id,
          job_id: jobId,
          lat: location.lat,
          lng: location.lng,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to clock in");
        return;
      }

      setActiveClock(data.entry);
      setTimer(0);
      getCurrentLocation(); // Refresh location
    } catch (err: any) {
      console.error("Clock-in error:", err);
      setError(err.message || "Failed to clock in");
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    if (!location || !activeClock) {
      setError("Location or active clock missing");
      return;
    }

    setClocking(true);
    setError(null);

    try {
      const response = await fetch("/api/workforce/time/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id: activeClock.id,
          lat: location.lat,
          lng: location.lng,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to clock out");
        return;
      }

      setActiveClock(null);
      setTimer(0);
      getCurrentLocation(); // Refresh location
      
      // Show success message
      alert(`Clocked out successfully. Duration: ${data.duration_hours} hours`);
    } catch (err: any) {
      console.error("Clock-out error:", err);
      setError(err.message || "Failed to clock out");
    } finally {
      setClocking(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <div className="text-red-600 font-semibold mb-2">Error</div>
          <div className="text-gray-600">{error}</div>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-gray-200 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isClockedIn = activeClock !== null;
  const canClockIn = location !== null && !isClockedIn && job?.site_lat && job?.site_lng;
  const canClockOut = location !== null && isClockedIn;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Time Clock</h1>
            {job?.notes && (
              <div className="text-sm text-gray-500 mt-1">{job.notes}</div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Status Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isClockedIn ? "bg-green-500" : "bg-gray-300"
                }`}
              />
              <span className="font-semibold text-gray-900">
                {isClockedIn ? "Clocked In" : "Not Clocked In"}
              </span>
            </div>
            {employee && (
              <div className="text-sm text-gray-500">
                {employee.first_name} {employee.last_name}
              </div>
            )}
          </div>

          {isClockedIn && activeClock && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-gray-600 mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Time on site:</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 font-mono">
                {formatTime(timer)}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Clocked in: {new Date(activeClock.clock_in).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Location Status */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Location</h2>
          </div>

          {locationError ? (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{locationError}</span>
            </div>
          ) : location ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Location detected</span>
              </div>
              <div className="text-xs text-gray-500 font-mono">
                Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
              </div>
              {job?.site_lat && job?.site_lng && (
                <div className="text-xs text-gray-500 mt-2">
                  Job site: {job.site_lat.toFixed(6)}, {job.site_lng.toFixed(6)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500">Getting location...</div>
          )}

          <button
            onClick={getCurrentLocation}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            Refresh Location
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">Error</span>
            </div>
            <div className="text-sm text-red-600 mt-1">{error}</div>
          </div>
        )}

        {/* Clock In/Out Button */}
        <div className="space-y-4">
          {!isClockedIn ? (
            <button
              onClick={handleClockIn}
              disabled={!canClockIn || clocking}
              className={`w-full rounded-xl py-4 px-6 font-semibold text-white transition-all ${
                canClockIn && !clocking
                  ? "bg-black hover:bg-gray-800 active:scale-95"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              {clocking ? "Clocking In..." : "Clock In"}
            </button>
          ) : (
            <button
              onClick={handleClockOut}
              disabled={!canClockOut || clocking}
              className={`w-full rounded-xl py-4 px-6 font-semibold text-white transition-all ${
                canClockOut && !clocking
                  ? "bg-red-600 hover:bg-red-700 active:scale-95"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              {clocking ? "Clocking Out..." : "Clock Out"}
            </button>
          )}

          {!job?.site_lat || !job?.site_lng ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-yellow-700 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>
                  Job site location not configured. Contact your manager to set GPS coordinates.
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Map Preview Placeholder */}
        {location && job?.site_lat && job?.site_lng && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Map Preview</h3>
            <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center">
              <div className="text-center text-gray-500 text-sm">
                <MapPin className="w-8 h-8 mx-auto mb-2" />
                <div>Map integration available</div>
                <div className="text-xs mt-1">
                  Your location and job site will be shown here
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
























