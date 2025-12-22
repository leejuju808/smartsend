"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Settings as SettingsIcon,
  Building2,
  Palette,
  Send,
  Bell,
  Calendar,
  GitBranch,
  Users,
  DollarSign,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import CompanyInfoSettings from "./components/CompanyInfoSettings";
import BrandingSettings from "./components/BrandingSettings";
import SendingSettings from "./components/SendingSettings";
import NotificationsSettings from "./components/NotificationsSettings";
import SchedulerDefaultsSettings from "./components/SchedulerDefaultsSettings";
import PipelineDefaultsSettings from "./components/PipelineDefaultsSettings";
import LeadAssignmentSettings from "./components/LeadAssignmentSettings";
import RevenueSettings from "./components/RevenueSettings";
import DangerZoneSettings from "./components/DangerZoneSettings";
import { getCurrentUserRole } from "@/lib/permissions";
import { createClientComponentClient } from "@/lib/supabase";

const sections = [
  { id: "info", label: "Company Info", icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "sending", label: "Sending Settings", icon: Send },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "scheduler", label: "Scheduler Defaults", icon: Calendar },
  { id: "pipeline", label: "Pipeline Defaults", icon: GitBranch },
  { id: "assignment", label: "Lead Assignment", icon: Users },
  { id: "revenue", label: "Revenue Settings", icon: DollarSign },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export default function CompanySettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<string>("info");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const section = searchParams.get("section") || "info";
    setActiveSection(section);
  }, [searchParams]);

  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const supabase = createClientComponentClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        // Get workspace ID from cookie
        const wsCookie = document.cookie
          .split("; ")
          .find((row) => row.startsWith("ws="));
        const wsId = wsCookie?.split("=")[1];

        if (!wsId) {
          setLoading(false);
          return;
        }

        setWorkspaceId(wsId);
        const role = await getCurrentUserRole(wsId, user.id);
        setUserRole(role);
      } catch (error) {
        console.error("Error loading user role:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserRole();
  }, [router]);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    router.push(`/settings/company?section=${section}`);
  };

  const isReadOnly = userRole === "viewer" || userRole === null;
  const canEdit = userRole === "owner" || userRole === "admin";
  const canEditDanger = userRole === "owner";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading company settings...</p>
        </div>
      </div>
    );
  }

  if (isReadOnly) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You don't have permission to view company settings. Only Owners and Admins can access these settings.
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case "info":
        return <CompanyInfoSettings canEdit={canEdit} />;
      case "branding":
        return <BrandingSettings canEdit={canEdit} />;
      case "sending":
        return <SendingSettings canEdit={canEdit} />;
      case "notifications":
        return <NotificationsSettings canEdit={canEdit} />;
      case "scheduler":
        return <SchedulerDefaultsSettings canEdit={canEdit} />;
      case "pipeline":
        return <PipelineDefaultsSettings canEdit={canEdit} />;
      case "assignment":
        return <LeadAssignmentSettings canEdit={canEdit} />;
      case "revenue":
        return <RevenueSettings canEdit={canEdit} />;
      case "danger":
        return <DangerZoneSettings canEdit={canEditDanger} />;
      default:
        return <CompanyInfoSettings canEdit={canEdit} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Company Settings</h1>
          </div>
          {!canEdit && (
            <p className="mt-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
              Read-only mode. Only Owners/Admins can edit.
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <ul className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <li key={section.id}>
                  <button
                    onClick={() => handleSectionChange(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="flex-1 text-left">{section.label}</span>
                    {isActive && <ChevronRight className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Company settings apply to your entire workspace. Only Owners/Admins can edit.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}





















































