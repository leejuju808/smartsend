"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";
import { Modal } from "@/components/ui/Modal";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  skill_level: string | null;
  status: string | null;
  phone: string | null;
  email: string | null;
  company_id: string;
};

type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  required_for_role: string | null;
};

type TrainingProgress = {
  id: string;
  module_id: string;
  status: string;
  completed_at: string | null;
};

type Certification = {
  id: string;
  cert_name: string;
  cert_type: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  cert_file_url: string | null;
};

type PerformanceLog = {
  id: string;
  log_type: string;
  notes: string | null;
  severity: string | null;
  created_at: string;
};

type TabKey = "overview" | "training" | "certs" | "performance";

export default function EmployeeProfilePage() {
  const supabase = createClientComponentClient();
  const params = useParams();
  const router = useRouter();
  const employeeId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [progress, setProgress] = useState<TrainingProgress[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [logs, setLogs] = useState<PerformanceLog[]>([]);

  const [showCertModal, setShowCertModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  // Certification form state
  const [certForm, setCertForm] = useState({
    cert_name: "",
    cert_type: "other",
    issue_date: "",
    expiry_date: "",
    cert_file_url: "",
  });

  // Performance log form state
  const [logForm, setLogForm] = useState({
    log_type: "praise",
    notes: "",
    severity: "low",
  });

  // Load company ID first
  useEffect(() => {
    const loadCompanyId = async () => {
      try {
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
        console.error("Error loading company ID:", error);
      }
    };

    loadCompanyId();
  }, [supabase]);

  useEffect(() => {
    if (!employeeId || !companyId) return;

    const load = async () => {
      setLoading(true);

      try {
        // 1) Employee
        const { data: empData, error: empError } = await supabase
          .from("workforce_employees")
          .select("*")
          .eq("id", employeeId)
          .eq("company_id", companyId)
          .single();

        if (empError || !empData) {
          console.error(empError);
          setLoading(false);
          return;
        }

        setEmployee(empData as Employee);

        // 2) Training modules (for this company)
        const { data: modulesData, error: modulesError } = await supabase
          .from("workforce_training_modules")
          .select("*")
          .eq("company_id", companyId);

        if (!modulesError && modulesData) {
          setModules(modulesData as TrainingModule[]);
        }

        // 3) Training progress
        const { data: progressData, error: progError } = await supabase
          .from("workforce_training_progress")
          .select("*")
          .eq("employee_id", employeeId);

        if (!progError && progressData) {
          setProgress(progressData as TrainingProgress[]);
        }

        // 4) Certifications
        const { data: certData, error: certError } = await supabase
          .from("workforce_certifications")
          .select("*")
          .eq("employee_id", employeeId)
          .order("expiry_date", { ascending: true });

        if (!certError && certData) {
          setCerts(certData as Certification[]);
        }

        // 5) Performance logs
        const { data: logsData, error: logsError } = await supabase
          .from("workforce_performance_logs")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false });

        if (!logsError && logsData) {
          setLogs(logsData as PerformanceLog[]);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [employeeId, companyId, supabase]);

  const getFullName = () =>
    employee ? `${employee.first_name} ${employee.last_name}` : "";

  const handleMarkModuleCompleted = async (moduleId: string) => {
    if (!employeeId) return;

    const existing = progress.find((p) => p.module_id === moduleId);

    if (existing) {
      const { error } = await supabase
        .from("workforce_training_progress")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        console.error(error);
        return;
      }

      setProgress((prev) =>
        prev.map((p) =>
          p.id === existing.id
            ? {
                ...p,
                status: "completed",
                completed_at: new Date().toISOString(),
              }
            : p
        )
      );
    } else {
      const { data, error } = await supabase
        .from("workforce_training_progress")
        .insert({
          employee_id: employeeId,
          module_id: moduleId,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        console.error(error);
        return;
      }

      setProgress((prev) => [...prev, data as TrainingProgress]);
    }
  };

  const handleSubmitCert = async () => {
    if (!employeeId) return;

    const { data, error } = await supabase
      .from("workforce_certifications")
      .insert({
        employee_id: employeeId,
        cert_name: certForm.cert_name,
        cert_type: certForm.cert_type,
        issue_date: certForm.issue_date || null,
        expiry_date: certForm.expiry_date || null,
        cert_file_url: certForm.cert_file_url || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setCerts((prev) => [...prev, data as Certification]);
    setCertForm({
      cert_name: "",
      cert_type: "other",
      issue_date: "",
      expiry_date: "",
      cert_file_url: "",
    });
    setShowCertModal(false);
  };

  const handleSubmitLog = async () => {
    if (!employeeId) return;

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("workforce_performance_logs")
      .insert({
        employee_id: employeeId,
        log_type: logForm.log_type,
        notes: logForm.notes,
        severity: logForm.severity,
        created_by: user?.id || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setLogs((prev) => [data as PerformanceLog, ...prev]);
    setLogForm({
      log_type: "praise",
      notes: "",
      severity: "low",
    });
    setShowLogModal(false);
  };

  const trainingStatusForModule = (moduleId: string) => {
    const p = progress.find((pr) => pr.module_id === moduleId);
    return p?.status || "not_started";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading employee...</div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6">
        <div className="mb-4">Employee not found.</div>
        <button
          className="rounded-md border px-3 py-1 text-sm"
          onClick={() => router.push("/workforce/employees")}
        >
          Back to employees
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{getFullName()}</h1>
          <p className="text-sm text-gray-500">
            {employee.role || "No role set"} · Skill:{" "}
            {employee.skill_level || "N/A"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              employee.status === "active"
                ? "bg-green-100 text-green-700"
                : employee.status === "terminated"
                ? "bg-red-100 text-red-700"
                : employee.status === "on_leave"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {employee.status || "active"}
          </span>
          <button
            className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
            onClick={() => setShowLogModal(true)}
          >
            Add Performance Log
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="-mb-px flex gap-4 text-sm">
          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </TabButton>
          <TabButton
            active={activeTab === "training"}
            onClick={() => setActiveTab("training")}
          >
            Training
          </TabButton>
          <TabButton
            active={activeTab === "certs"}
            onClick={() => setActiveTab("certs")}
          >
            Certifications
          </TabButton>
          <TabButton
            active={activeTab === "performance"}
            onClick={() => setActiveTab("performance")}
          >
            Performance
          </TabButton>
        </nav>
      </div>

      {/* Content */}
      {activeTab === "overview" && (
        <OverviewTab
          employee={employee}
          modules={modules}
          progress={progress}
          certs={certs}
          logs={logs}
        />
      )}

      {activeTab === "training" && (
        <TrainingTab
          modules={modules}
          progress={progress}
          trainingStatusForModule={trainingStatusForModule}
          onMarkCompleted={handleMarkModuleCompleted}
        />
      )}

      {activeTab === "certs" && (
        <CertsTab certs={certs} onAddClick={() => setShowCertModal(true)} />
      )}

      {activeTab === "performance" && <PerformanceTab logs={logs} />}

      {/* Modals */}
      <Modal
        open={showCertModal}
        title="Add Certification"
        onClose={() => setShowCertModal(false)}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Certification name
            </label>
            <input
              className="w-full rounded-md border px-2 py-1 text-sm"
              value={certForm.cert_name}
              onChange={(e) =>
                setCertForm((f) => ({ ...f, cert_name: e.target.value }))
              }
              placeholder="OSHA-10, Fall Protection, etc."
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Certification type
            </label>
            <select
              className="w-full rounded-md border px-2 py-1 text-sm"
              value={certForm.cert_type}
              onChange={(e) =>
                setCertForm((f) => ({ ...f, cert_type: e.target.value }))
              }
            >
              <option value="osha">OSHA</option>
              <option value="insurance">Insurance</option>
              <option value="fall_protection">Fall Protection</option>
              <option value="manufacturer">Manufacturer</option>
              <option value="state_license">State License</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">
                Issue date
              </label>
              <input
                type="date"
                className="w-full rounded-md border px-2 py-1 text-sm"
                value={certForm.issue_date}
                onChange={(e) =>
                  setCertForm((f) => ({ ...f, issue_date: e.target.value }))
                }
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">
                Expiry date
              </label>
              <input
                type="date"
                className="w-full rounded-md border px-2 py-1 text-sm"
                value={certForm.expiry_date}
                onChange={(e) =>
                  setCertForm((f) => ({ ...f, expiry_date: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              File URL (optional)
            </label>
            <input
              className="w-full rounded-md border px-2 py-1 text-sm"
              value={certForm.cert_file_url}
              onChange={(e) =>
                setCertForm((f) => ({ ...f, cert_file_url: e.target.value }))
              }
              placeholder="Link to PDF / drive / storage"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setShowCertModal(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
              onClick={handleSubmitCert}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showLogModal}
        title="Add Performance Log"
        onClose={() => setShowLogModal(false)}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <select
              className="w-full rounded-md border px-2 py-1 text-sm"
              value={logForm.log_type}
              onChange={(e) =>
                setLogForm((f) => ({ ...f, log_type: e.target.value }))
              }
            >
              <option value="praise">Praise</option>
              <option value="issue">Issue</option>
              <option value="attendance">Attendance</option>
              <option value="violation">Violation</option>
              <option value="review">Review</option>
              <option value="incident">Incident</option>
              <option value="note">Note</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Severity</label>
            <select
              className="w-full rounded-md border px-2 py-1 text-sm"
              value={logForm.severity}
              onChange={(e) =>
                setLogForm((f) => ({ ...f, severity: e.target.value }))
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <textarea
              className="w-full rounded-md border px-2 py-1 text-sm"
              rows={4}
              value={logForm.notes}
              onChange={(e) =>
                setLogForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Describe what happened..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setShowLogModal(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
              onClick={handleSubmitLog}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-sm ${
        active
          ? "border-black font-medium text-black"
          : "border-transparent text-gray-500 hover:text-black"
      }`}
    >
      {children}
    </button>
  );
}

function OverviewTab({
  employee,
  modules,
  progress,
  certs,
  logs,
}: {
  employee: Employee;
  modules: TrainingModule[];
  progress: TrainingProgress[];
  certs: Certification[];
  logs: PerformanceLog[];
}) {
  const totalRequired = modules.filter((m) => {
    if (!m.required_for_role) return false;
    if (m.required_for_role === "everyone") return true;
    return m.required_for_role === employee.role;
  }).length;

  const completedRequired = modules.filter((m) => {
    if (!m.required_for_role) return false;
    if (m.required_for_role === "everyone") return true;
    if (m.required_for_role !== employee.role) return false;
    const p = progress.find((pr) => pr.module_id === m.id);
    return p?.status === "completed";
  }).length;

  const nextExpiring = certs
    .filter((c) => c.expiry_date)
    .slice()
    .sort((a, b) =>
      (a.expiry_date || "").localeCompare(b.expiry_date || "")
    )[0];

  const recentLogs = logs.slice(0, 3);

  const completionPercent =
    totalRequired === 0
      ? 0
      : Math.round((completedRequired / totalRequired) * 100);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-4 md:col-span-2">
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold mb-2">Contact</h2>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-gray-500">Phone: </span>
              {employee.phone || "—"}
            </p>
            <p>
              <span className="text-gray-500">Email: </span>
              {employee.email || "—"}
            </p>
            <p>
              <span className="text-gray-500">Role: </span>
              {employee.role || "—"}
            </p>
            <p>
              <span className="text-gray-500">Skill level: </span>
              {employee.skill_level || "—"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold mb-2">Recent Performance</h2>
          {recentLogs.length === 0 && (
            <p className="text-sm text-gray-500">No logs yet.</p>
          )}
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="border-b last:border-b-0 pb-2 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase text-gray-500">
                    {log.log_type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{log.notes}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold mb-2">Training Completion</h2>
          <p className="text-2xl font-semibold mb-1">{completionPercent}%</p>
          <p className="text-xs text-gray-500 mb-2">
            {completedRequired} of {totalRequired} required modules completed
          </p>
          <div className="h-2 w-full rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-black"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-semibold mb-2">
            Next Certification Expiring
          </h2>
          {nextExpiring ? (
            <div className="text-sm">
              <p className="font-medium">{nextExpiring.cert_name}</p>
              <p className="text-xs text-gray-500">
                Expires:{" "}
                {nextExpiring.expiry_date
                  ? new Date(nextExpiring.expiry_date).toLocaleDateString()
                  : "—"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No certifications on file.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainingTab({
  modules,
  progress,
  trainingStatusForModule,
  onMarkCompleted,
}: {
  modules: TrainingModule[];
  progress: TrainingProgress[];
  trainingStatusForModule: (moduleId: string) => string;
  onMarkCompleted: (moduleId: string) => void;
}) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left">Module</th>
            <th className="px-4 py-2 text-left">Description</th>
            <th className="px-4 py-2 text-left">Required for</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const status = trainingStatusForModule(m.id);
            return (
              <tr key={m.id} className="border-t">
                <td className="px-4 py-2">{m.title}</td>
                <td className="px-4 py-2 text-gray-600">
                  {m.description || "—"}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {m.required_for_role || "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      status === "completed"
                        ? "bg-green-100 text-green-700"
                        : status === "in_progress"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {status !== "completed" && (
                    <button
                      className="rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
                      onClick={() => onMarkCompleted(m.id)}
                    >
                      Mark completed
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {!modules.length && (
            <tr>
              <td
                className="px-4 py-4 text-center text-gray-500"
                colSpan={5}
              >
                No training modules configured yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CertsTab({
  certs,
  onAddClick,
}: {
  certs: Certification[];
  onAddClick: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Certifications</h2>
        <button
          className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
          onClick={onAddClick}
        >
          + Add Certification
        </button>
      </div>
      <div className="rounded-xl border overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Certification</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Issue date</th>
              <th className="px-4 py-2 text-left">Expiry date</th>
              <th className="px-4 py-2 text-left">File</th>
            </tr>
          </thead>
          <tbody>
            {certs.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2">{c.cert_name}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {c.cert_type || "—"}
                </td>
                <td className="px-4 py-2">
                  {c.issue_date
                    ? new Date(c.issue_date).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {c.expiry_date
                    ? new Date(c.expiry_date).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {c.cert_file_url ? (
                    <a
                      href={c.cert_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline hover:text-blue-800"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">No file</span>
                  )}
                </td>
              </tr>
            ))}
            {!certs.length && (
              <tr>
                <td
                  className="px-4 py-4 text-center text-gray-500"
                  colSpan={5}
                >
                  No certifications on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerformanceTab({ logs }: { logs: PerformanceLog[] }) {
  const getSeverityColor = (severity: string | null) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "medium":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-2">
      {logs.length === 0 && (
        <p className="text-sm text-gray-500">No performance logs yet.</p>
      )}
      {logs.map((log) => (
        <div key={log.id} className="border-b last:border-b-0 pb-2 last:pb-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase text-gray-500">
                {log.log_type}
              </span>
              {log.severity && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${getSeverityColor(
                    log.severity
                  )}`}
                >
                  {log.severity}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-sm">{log.notes}</p>
        </div>
      ))}
    </div>
  );
}
























