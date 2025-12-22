"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type Asset = {
  id: string;
  name: string;
  category: string;
  status: string;
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
};

type Job = {
  id: string;
  stage: string;
};

export default function AssignEquipmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job_id");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string>(jobId || "");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assetsRes, employeesRes, jobsRes] = await Promise.all([
        fetch("/api/workforce/assets?status=available"),
        fetch("/api/workforce/employees?status=active"),
        fetch("/api/jobs?status=active"),
      ]);

      const assetsData = await assetsRes.json();
      const employeesData = await employeesRes.json();
      const jobsData = await jobsRes.json();

      setAssets(assetsData.assets || []);
      setEmployees(employeesData.employees || []);
      setJobs(jobsData.jobs || []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAsset = (assetId: string) => {
    const newSelected = new Set(selectedAssets);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssets(newSelected);
  };

  const handleAssign = async () => {
    if (selectedAssets.size === 0) {
      alert("Please select at least one asset");
      return;
    }

    if (!selectedEmployee && !selectedJob) {
      alert("Please select an employee or job");
      return;
    }

    try {
      setSubmitting(true);
      const assignments = Array.from(selectedAssets).map((assetId) =>
        fetch("/api/workforce/assets/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_id: assetId,
            employee_id: selectedEmployee || null,
            job_id: selectedJob || null,
          }),
        })
      );

      await Promise.all(assignments);
      router.push("/workforce/assets");
    } catch (error) {
      console.error("Error assigning assets:", error);
      alert("Failed to assign equipment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Assign Equipment</h1>
          <p className="text-gray-600 mt-1">
            Assign equipment to employees or jobs
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selection Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Assignment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job (Optional)
              </label>
              <select
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a job...</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    Job #{job.id.slice(0, 8)} - {job.stage}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employee (Optional)
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4 border-t">
              <div className="text-sm text-gray-600 mb-2">
                Selected: {selectedAssets.size} asset(s)
              </div>
              <Button
                onClick={handleAssign}
                disabled={submitting || selectedAssets.size === 0}
                className="w-full"
              >
                {submitting ? "Assigning..." : "Assign Equipment"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Available Assets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Available Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : assets.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No available equipment</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => toggleAsset(asset.id)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedAssets.has(asset.id)
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{asset.name}</div>
                        <div className="text-sm text-gray-500 capitalize mt-1">
                          {asset.category.replace("_", " ")}
                        </div>
                      </div>
                      {selectedAssets.has(asset.id) ? (
                        <Check className="w-5 h-5 text-blue-500" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-300 rounded" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
























