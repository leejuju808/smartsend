"use client";

import { useState, useEffect } from "react";
import { Users, UserPlus, Award, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface DashboardStats {
  employee_counts: {
    active: number;
    terminated: number;
    seasonal: number;
    on_leave: number;
  };
  applicant_counts: {
    new: number;
    review: number;
    interview: number;
    hired: number;
    rejected: number;
    withdrawn: number;
  };
  expiring_certifications: Array<{
    id: string;
    cert_name: string;
    expiry_date: string;
    employee: {
      first_name: string;
      last_name: string;
    };
  }>;
  training_stats: Array<{
    module_title: string;
    completion_percentage: number;
    completed_count: number;
    total_employees: number;
  }>;
  compliance_summary?: {
    certifications: {
      expired: number;
      expiring_7: number;
      expiring_30: number;
      valid: number;
    };
    training: {
      high: number;
      medium: number;
      low: number;
    };
  };
  recent_performance_logs: Array<{
    id: string;
    log_type: string;
    notes: string;
    severity: string;
    created_at: string;
    employee: {
      first_name: string;
      last_name: string;
    };
  }>;
}

export function WorkforceDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  async function fetchDashboardStats() {
    try {
      const [dashboardRes, complianceRes] = await Promise.all([
        fetch("/api/workforce/dashboard"),
        fetch("/api/workforce/compliance"),
      ]);
      
      const dashboardData = await dashboardRes.json();
      const complianceData = await complianceRes.json();
      
      setStats({
        ...dashboardData,
        compliance_summary: {
          certifications: complianceData.certifications?.summary || {
            expired: 0,
            expiring_7: 0,
            expiring_30: 0,
            valid: 0,
          },
          training: complianceData.training?.summary || {
            high: 0,
            medium: 0,
            low: 0,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!stats) {
    return <div className="text-center py-12 text-red-600">Failed to load dashboard</div>;
  }

  const totalEmployees =
    stats.employee_counts.active +
    stats.employee_counts.terminated +
    stats.employee_counts.seasonal +
    stats.employee_counts.on_leave;

  const activeApplicants =
    stats.applicant_counts.new +
    stats.applicant_counts.review +
    stats.applicant_counts.interview;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Employees</p>
              <p className="text-2xl font-bold mt-1">{totalEmployees}</p>
              <p className="text-xs text-green-600 mt-1">
                {stats.employee_counts.active} active
              </p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Applicants</p>
              <p className="text-2xl font-bold mt-1">{activeApplicants}</p>
              <p className="text-xs text-blue-600 mt-1">
                {stats.applicant_counts.new} new
              </p>
            </div>
            <UserPlus className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Certification Risk</p>
              <p className="text-2xl font-bold mt-1">
                {stats.compliance_summary
                  ? stats.compliance_summary.certifications.expired +
                    stats.compliance_summary.certifications.expiring_30 +
                    stats.compliance_summary.certifications.expiring_7
                  : stats.expiring_certifications.length}
              </p>
              <p className="text-xs text-orange-600 mt-1">
                {stats.compliance_summary?.certifications.expired || 0} expired ·{" "}
                {stats.compliance_summary?.certifications.expiring_30 || 0} expiring
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Training Risk</p>
              <p className="text-2xl font-bold mt-1">
                {stats.compliance_summary?.training.high || 0}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                High risk · {stats.compliance_summary?.training.medium || 0} medium ·{" "}
                {stats.compliance_summary?.training.low || 0} low
              </p>
            </div>
            <Award className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Expiring Certifications Alert */}
      {stats.expiring_certifications.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <h3 className="font-semibold text-orange-900">
              Certifications Expiring Soon
            </h3>
          </div>
          <div className="space-y-2">
            {stats.expiring_certifications.slice(0, 5).map((cert) => {
              const daysUntil = Math.ceil(
                (new Date(cert.expiry_date).getTime() - new Date().getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              return (
                <div
                  key={cert.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    <strong>
                      {cert.employee.first_name} {cert.employee.last_name}
                    </strong>
                    {" - "}
                    {cert.cert_name}
                  </span>
                  <span className="text-orange-700 font-medium">
                    {daysUntil} days
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Training Progress */}
      {stats.training_stats.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-lg mb-4">Training Completion</h3>
          <div className="space-y-4">
            {stats.training_stats.slice(0, 5).map((stat, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{stat.module_title}</span>
                  <span className="text-sm text-gray-600">
                    {stat.completed_count}/{stat.total_employees}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${stat.completion_percentage}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {stat.completion_percentage.toFixed(0)}% complete
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Performance Logs */}
      {stats.recent_performance_logs.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-semibold text-lg mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {stats.recent_performance_logs.map((log) => {
              const icon =
                log.log_type === "praise" ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : log.log_type === "issue" || log.log_type === "violation" ? (
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                ) : (
                  <Clock className="h-4 w-4 text-gray-600" />
                );

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  {icon}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {log.employee.first_name} {log.employee.last_name}
                      </span>
                      <span className="text-xs text-gray-500 capitalize">
                        {log.log_type}
                      </span>
                      {log.severity !== "low" && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 capitalize">
                          {log.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{log.notes}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(log.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
