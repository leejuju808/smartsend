"use client";

// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// Mobile page: Today's Jobs for a crew
// app/crew/mobile/[crew_id]/jobs/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapPin, Phone, Clock, FileText } from "lucide-react";

interface Job {
  id: string;
  job_id: string;
  start_date: string;
  start_time?: string | null;
  roofing_jobs: {
    id: string;
    title?: string | null;
    job_name?: string | null;
    homeowner_name?: string | null;
    address?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    notes?: string | null;
  };
}

export default function CrewJobs() {
  const params = useParams();
  const router = useRouter();
  const crew_id = params.crew_id as string;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!crew_id) return;

    fetch(`/api/crew/${crew_id}/today`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          console.error("Error fetching jobs:", d.error);
          setJobs([]);
        } else {
          setJobs(d.jobs || []);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error:", err);
        setJobs([]);
        setLoading(false);
      });
  }, [crew_id]);

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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Today's Jobs</h1>

        {jobs.length === 0 ? (
          <div className="bg-white rounded-lg p-6 text-center shadow-sm">
            <p className="text-gray-500">No jobs scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((j) => {
              const job = j.roofing_jobs;
              const jobName = job.title || "Untitled Job";
              const address = job.address || "No address";
              const customerName = job.homeowner_name || "No name";
              const customerPhone = null; // Phone would come from contacts table if needed

              return (
                <a
                  key={j.id}
                  href={`/crew/mobile/${crew_id}/job/${j.job_id}`}
                  className="block border border-gray-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="font-semibold text-lg text-gray-900 mb-2">
                    {jobName}
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    {address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{address}</span>
                      </div>
                    )}

                    {customerName && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <span>Customer: {customerName}</span>
                      </div>
                    )}

                    {customerPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 flex-shrink-0" />
                        <a
                          href={`tel:${customerPhone}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {customerPhone}
                        </a>
                      </div>
                    )}

                    {j.start_time && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>Start: {j.start_time}</span>
                      </div>
                    )}

                    {job.notes && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-500">Notes:</div>
                        <div className="text-gray-700">{job.notes}</div>
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}



































