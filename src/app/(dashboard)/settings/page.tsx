"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Settings as SettingsIcon,
  Globe,
  Send,
  Target,
  Shield,
  BookOpen,
  Palette,
  ChevronRight,
  Code,
  Bell,
  Phone,
  Clock,
  Calendar,
  Zap,
  ShieldCheck,
  Download,
  Building2,
  Inbox
} from "lucide-react";
import GeneralSettings from "./components/GeneralSettings";
import SendingSettings from "./components/SendingSettings";
import SendingWindowsSettings from "./components/SendingWindowsSettings";
import ScoringSettings from "./components/ScoringSettings";
import PermissionsSettings from "./components/PermissionsSettings";
import PlaybooksSettings from "./components/PlaybooksSettings";
import BrandingSettings from "./components/BrandingSettings";
import ComplianceSettings from "./components/ComplianceSettings";
import SendingDomainsSettings from "./components/SendingDomainsSettings";
import ServiceAreasSettings from "./components/ServiceAreasSettings";
import TimeSettings from "./components/TimeSettings";
import SchedulerRulesSettings from "./components/SchedulerRulesSettings";
import IntegrationsSettings from "./components/IntegrationsSettings";
import SecuritySettings from "./components/SecuritySettings";
import DataExportSettings from "./components/DataExportSettings";
import ContractorProfileSettings from "./components/ContractorProfileSettings";
import { getCurrentUserRole } from "@/lib/permissions";
import { createClientComponentClient } from "@/lib/supabase";

const sections = [
  { id: "general", label: "General", icon: Globe },
  { id: "sending", label: "Sending", icon: Send },
  { id: "sending-windows", label: "Sending Windows", icon: Send },
  { id: "scoring", label: "Lead Scoring", icon: Target },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "playbooks", label: "Playbooks", icon: BookOpen },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "compliance", label: "Compliance", icon: Shield },
  { id: "domains", label: "Sending Domains", icon: Globe },
  { id: "service-areas", label: "Service Areas", icon: Globe },
  { id: "time", label: "Time Settings", icon: Clock },
  { id: "scheduler-rules", label: "Scheduler Rules", icon: Calendar },
  { id: "integrations", label: "Integrations", icon: Zap },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "export", label: "Data Export", icon: Download },
  { id: "contractor-profile", label: "Contractor Profile", icon: Building2 },
  { id: "suppression", label: "Suppression List", icon: Shield, route: "/settings/suppression" },
  { id: "contact", label: "Contact & Booking", icon: Phone, route: "/settings/contact" },
  { id: "notifications", label: "Notifications", icon: Bell, route: "/settings/notifications" },
  { id: "inbox", label: "Inbox Settings", icon: Inbox, route: "/settings/inbox" },
  { id: "automations", label: "Automations", icon: Zap, route: "/settings/automations" },
  { id: "developer", label: "Developer", icon: Code },
];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<string>("general");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const section = searchParams.get("section") || "general";
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
    const sectionConfig = sections.find((s: any) => s.id === section);
    if (sectionConfig && 'route' in sectionConfig && sectionConfig.route) {
      router.push(sectionConfig.route);
      return;
    }
    if (section === "developer") {
      router.push("/settings/developer");
      return;
    }
    if (section === "contact") {
      router.push("/settings/contact");
      return;
    }
    if (section === "inbox") {
      router.push("/settings/inbox");
      return;
    }
    if (section === "automations") {
      router.push("/settings/automations");
      return;
    }
    setActiveSection(section);
    router.push(`/settings?section=${section}`);
  };

  const isReadOnly = userRole === "viewer" || userRole === null;
  const canEdit = userRole === "owner" || userRole === "admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (isReadOnly) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You don't have permission to view settings. Only Owners and Admins can access workspace settings.
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case "general":
        return <GeneralSettings canEdit={canEdit} />;
      case "sending":
        return <SendingSettings canEdit={canEdit} />;
      case "sending-windows":
        return <SendingWindowsSettings canEdit={canEdit} />;
      case "scoring":
        return <ScoringSettings canEdit={canEdit} />;
      case "permissions":
        return <PermissionsSettings canEdit={canEdit} />;
      case "playbooks":
        return <PlaybooksSettings canEdit={canEdit} />;
      case "branding":
        return <BrandingSettings canEdit={canEdit} />;
      case "compliance":
        return <ComplianceSettings canEdit={canEdit} />;
      case "domains":
        return <SendingDomainsSettings canEdit={canEdit} />;
      case "service-areas":
        return <ServiceAreasSettings canEdit={canEdit} />;
      case "time":
        return <TimeSettings canEdit={canEdit} />;
      case "scheduler-rules":
        return <SchedulerRulesSettings canEdit={canEdit} />;
      case "integrations":
        return <IntegrationsSettings canEdit={canEdit} />;
      case "security":
        return <SecuritySettings canEdit={canEdit} />;
      case "export":
        return <DataExportSettings canEdit={canEdit} />;
      case "contractor-profile":
        return <ContractorProfileSettings canEdit={canEdit} />;
      default:
        return <GeneralSettings canEdit={canEdit} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
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
            Changes apply to entire workspace. Only Owners/Admins can edit.
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






