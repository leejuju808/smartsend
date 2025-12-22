"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type Row = {
  row_no: number;
  raw: Record<string, any>;
  mapped: Record<string, any> | null;
  issues: string[];
  is_valid: boolean;
};

type Job = {
  id: string;
  created_at: string;
  filename: string | null;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  deduped_rows: number;
  error?: string | null;
};

export default function ImportPreviewPage() {
  const params = useParams();
  const jobId = params.job as string;
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const size = 100;

  useEffect(() => {
    async function load() {
      try {
        // Load job details
        const jobRes = await fetch(`/api/imports/${jobId}`);
        if (!jobRes.ok) {
          alert("Job not found");
          return;
        }
        const jobData = await jobRes.json();
        setJob(jobData.job);

        // Load rows
        const rowsRes = await fetch(`/api/imports/${jobId}/rows?page=${page}&size=${size}`);
        if (!rowsRes.ok) {
          alert("Failed to load rows");
          return;
        }
        const rowsData = await rowsRes.json();
        setRows(rowsData.rows || []);
      } catch (err) {
        console.error("Error loading preview:", err);
        alert("Failed to load preview");
      } finally {
        setLoading(false);
      }
    }
    if (jobId) load();
  }, [jobId, page]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <div className="text-sm">Job not found</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import Preview</h1>
          <div className="text-sm opacity-70 mt-1">
            {job.filename || "upload.csv"} · {new Date(job.created_at).toLocaleString()}
          </div>
        </div>
        <Badge variant={job.status === "done" ? "default" :
                        job.status === "ready" ? "secondary" :
                        job.status === "error" ? "destructive" : "outline"}>
          {job.status}
        </Badge>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Summary</div>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <div className="opacity-70">Total Rows</div>
            <div className="font-medium">{job.total_rows}</div>
          </div>
          <div>
            <div className="opacity-70">Valid</div>
            <div className="font-medium text-green-600">{job.valid_rows}</div>
          </div>
          <div>
            <div className="opacity-70">Invalid</div>
            <div className="font-medium text-red-600">{job.invalid_rows}</div>
          </div>
          <div>
            <div className="opacity-70">Deduplicated</div>
            <div className="font-medium text-yellow-600">{job.deduped_rows}</div>
          </div>
        </div>
        {job.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
            Error: {job.error}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Rows Preview</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Row #</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Issues</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.row_no} className="border-b">
                  <td className="p-2">{row.row_no}</td>
                  <td className="p-2 font-mono text-xs">
                    {row.mapped?.email || row.raw?.email || "—"}
                  </td>
                  <td className="p-2">
                    {row.issues && row.issues.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.issues.map((issue, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {issue}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="opacity-70">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    <Badge variant={row.is_valid ? "default" : "destructive"}>
                      {row.is_valid ? "Valid" : "Invalid"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="text-sm opacity-70 p-4 text-center">
            No rows found
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <div className="text-sm">Page {page}</div>
          <button
            className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
            disabled={rows.length < size}
          >
            Next
          </button>
        </div>
      </Card>
    </div>
  );
}

