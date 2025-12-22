"use client";

// Block 83000 — SmartSend Roofing Homeowner Portal v1
// Internal Dashboard: Manage Homeowner Portals per Job

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Mail, Plus, ToggleLeft, ToggleRight } from "lucide-react";

interface Portal {
  id: string;
  job_id: string;
  portal_token: string;
  is_active: boolean;
  homeowner_email: string | null;
  homeowner_name: string | null;
  created_at: string;
}

interface Job {
  id: string;
  title: string | null;
  status: string;
  homeowner_name: string | null;
  homeowner_email: string | null;
}

export default function HomeownerPortalPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [portals, setPortals] = useState<Record<string, Portal>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Load jobs
      const jobsRes = await fetch("/api/jobs/list");
      if (!jobsRes.ok) throw new Error("Failed to load jobs");
      const jobsData = await jobsRes.json();
      setJobs(jobsData.jobs || []);

      // Load portals for each job
      const portalsMap: Record<string, Portal> = {};
      for (const job of jobsData.jobs || []) {
        try {
          const portalRes = await fetch(`/api/homeowner-portal/${job.id}`);
          if (portalRes.ok) {
            const portalData = await portalRes.json();
            if (portalData.portal) {
              portalsMap[job.id] = portalData.portal;
            }
          }
        } catch (e) {
          // Portal doesn't exist yet, that's okay
        }
      }
      setPortals(portalsMap);
    } catch (e: any) {
      console.error("Error loading data:", e);
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function createPortal(jobId: string) {
    setCreating((prev) => new Set(prev).add(jobId));
    try {
      const job = jobs.find((j) => j.id === jobId);
      const res = await fetch("/api/homeowner-portal/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          homeowner_email: job?.homeowner_email,
          homeowner_name: job?.homeowner_name,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create portal");
      }

      const data = await res.json();
      setPortals((prev) => ({ ...prev, [jobId]: data.portal }));
    } catch (err: any) {
      console.error("Error creating portal:", err);
      alert(err.message || "Failed to create portal");
    } finally {
      setCreating((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  async function togglePortal(jobId: string, currentActive: boolean) {
    setUpdating((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/homeowner-portal/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update portal");
      }

      const data = await res.json();
      setPortals((prev) => ({ ...prev, [jobId]: data.portal }));
    } catch (err: any) {
      console.error("Error updating portal:", err);
      alert(err.message || "Failed to update portal");
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  function copyPortalLink(token: string) {
    const baseUrl = window.location.origin;
    const portalUrl = `${baseUrl}/portal/${token}`;
    navigator.clipboard.writeText(portalUrl);
    alert("Portal link copied to clipboard!");
  }

  function getPortalUrl(token: string) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/portal/${token}`;
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Homeowner Portals</h1>
        <p className="text-sm text-gray-600">
          Manage homeowner portals for each job. Share secure links so homeowners can track their project.
        </p>
      </div>

      <div className="space-y-4">
        {jobs.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">
            No jobs found. Create a job first.
          </Card>
        ) : (
          jobs.map((job) => {
            const portal = portals[job.id];
            return (
              <Card key={job.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">
                      {job.title || "Roof Job"}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {job.homeowner_name && (
                        <span>Homeowner: {job.homeowner_name}</span>
                      )}
                      {job.homeowner_email && (
                        <span className="ml-2">({job.homeowner_email})</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      Status: <span className="font-medium">{job.status}</span>
                    </p>

                    {portal ? (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Portal:</span>
                          <span className="text-sm text-gray-600">
                            {portal.is_active ? "Active" : "Inactive"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => togglePortal(job.id, portal.is_active)}
                            disabled={updating.has(job.id)}
                          >
                            {portal.is_active ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyPortalLink(portal.portal_token)}
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(getPortalUrl(portal.portal_token), "_blank")}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View as Homeowner
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const subject = encodeURIComponent("Your Roof Project Portal");
                              const body = encodeURIComponent(
                                `Hi ${job.homeowner_name || "there"},\n\n` +
                                `Here's your project portal where you can track your roof project:\n\n` +
                                `${getPortalUrl(portal.portal_token)}\n\n` +
                                `You can see updates, photos, and documents all in one place.\n\n` +
                                `Best regards`
                              );
                              window.location.href = `mailto:${job.homeowner_email || ""}?subject=${subject}&body=${body}`;
                            }}
                            disabled={!job.homeowner_email}
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Send Link via Email
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => createPortal(job.id)}
                          disabled={creating.has(job.id)}
                        >
                          {creating.has(job.id) ? (
                            "Creating..."
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Create Portal
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}



























