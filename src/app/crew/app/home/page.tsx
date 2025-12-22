"use client";

// Block 225000 — SmartSend Roofing Crew App v1
// Mobile-first Crew App — Home Screen

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TodayJob {
  id: string;
  address: string;
  homeowner_name?: string;
  homeowner_phone?: string;
  production_date?: string;
  scheduled_start_date?: string;
  stage?: string;
  status?: string;
  notes?: string;
}

interface ServiceJob {
  id: string;
  ticket: {
    id: string;
    ticket_number: string;
    ticket_type: string;
    description: string;
    priority: string;
    property_address: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    is_warranty_covered: boolean;
  };
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
}

export default function CrewAppHomePage() {
  const router = useRouter();
  const [todayJobs, setTodayJobs] = useState<TodayJob[]>([]);
  const [serviceJobs, setServiceJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [crewId, setCrewId] = useState<string | null>(null);

  useEffect(() => {
    const session = localStorage.getItem("crewSession");
    if (!session) {
      router.push("/crew/app");
      return;
    }

    const sessionData = JSON.parse(session);
    setCrewId(sessionData.crew.id);
    setTodayJobs([...sessionData.todayJobs, ...sessionData.roofingJobs]);
    
    // Load service jobs
    if (sessionData.crew.id) {
      loadServiceJobs(sessionData.crew.id);
    }
    
    setLoading(false);
  }, [router]);

  const loadServiceJobs = async (crewId: string) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await fetch(`/api/crew/service-jobs?crew_id=${crewId}&date=${today}`);
      const data = await response.json();
      if (data.service_jobs) {
        setServiceJobs(data.service_jobs);
      }
    } catch (error) {
      console.error("Error loading service jobs:", error);
    }
  };

  const handleStartDay = (jobId: string) => {
    router.push(`/crew/app/job/${jobId}/start`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-orange-600 text-white p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">SmartSend Crew</h1>
          <button
            onClick={() => {
              localStorage.removeItem("crewSession");
              router.push("/crew/app");
            }}
            className="text-sm underline"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex px-4">
          <button className="px-4 py-2 border-b-2 border-orange-600 font-medium text-orange-600">
            Production Jobs
          </button>
          <button className="px-4 py-2 text-gray-600">
            Service Jobs ({serviceJobs.length})
          </button>
        </div>
      </div>

      {/* Today's Production Jobs */}
      <div className="p-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Today's Production Jobs</h2>

        {todayJobs.length === 0 ? (
          <div className="bg-white rounded-lg p-6 text-center">
            <p className="text-gray-600">No jobs scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-4">
            {todayJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg">
                      {job.address || "No address"}
                    </h3>
                    {job.homeowner_name && (
                      <p className="text-sm text-gray-600 mt-1">
                        {job.homeowner_name}
                      </p>
                    )}
                  </div>
                  <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-1 rounded">
                    {job.stage || job.status || "Scheduled"}
                  </span>
                </div>

                {job.homeowner_phone && (
                  <div className="mb-3">
                    <a
                      href={`tel:${job.homeowner_phone}`}
                      className="text-orange-600 text-sm font-medium flex items-center"
                    >
                      📞 {job.homeowner_phone}
                    </a>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => handleStartDay(job.id)}
                    className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition-colors"
                  >
                    Start Day
                  </button>
                  <Link
                    href={`/crew/app/job/${job.id}`}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold text-center hover:bg-gray-200 transition-colors"
                  >
                    View Details
                  </Link>
                </div>
                
                {/* AI Field Assistant Button */}
                <Link
                  href="/crew/ai"
                  className="mt-2 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-orange-700 text-white px-4 py-3 rounded-lg font-semibold hover:from-orange-700 hover:to-orange-800 transition-colors shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  💬 Ask SmartSend AI
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service Jobs Today */}
      {serviceJobs.length > 0 && (
        <div className="p-4 border-t border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Service Jobs Today</h2>
          <div className="space-y-4">
            {serviceJobs.map((serviceJob) => (
              <div
                key={serviceJob.id}
                className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-lg">
                      #{serviceJob.ticket.ticket_number}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1 capitalize">
                      {serviceJob.ticket.ticket_type.replace("_", " ")}
                    </p>
                    {serviceJob.ticket.property_address && (
                      <p className="text-sm text-gray-600 mt-1">
                        {serviceJob.ticket.property_address}
                      </p>
                    )}
                    {serviceJob.ticket.customer_name && (
                      <p className="text-sm text-gray-600 mt-1">
                        {serviceJob.ticket.customer_name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {serviceJob.ticket.is_warranty_covered && (
                      <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                        Warranty
                      </span>
                    )}
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                      {serviceJob.ticket.priority}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-700 mb-3">{serviceJob.ticket.description}</p>

                {serviceJob.ticket.customer_phone && (
                  <div className="mb-3">
                    <a
                      href={`tel:${serviceJob.ticket.customer_phone}`}
                      className="text-blue-600 text-sm font-medium flex items-center"
                    >
                      📞 {serviceJob.ticket.customer_phone}
                    </a>
                  </div>
                )}

                <div className="flex gap-2">
                  <Link
                    href={`/crew/app/service/${serviceJob.ticket.id}`}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold text-center hover:bg-blue-700 transition-colors"
                  >
                    Start Service
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-4 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/crew/app/schedule"
            className="bg-white border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors"
          >
            <div className="text-2xl mb-2">📅</div>
            <div className="text-sm font-medium text-gray-700">View Schedule</div>
          </Link>
          <a
            href="tel:+15551234567"
            className="bg-white border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors"
          >
            <div className="text-2xl mb-2">📞</div>
            <div className="text-sm font-medium text-gray-700">Call Office</div>
          </a>
        </div>
      </div>
    </div>
  );
}
