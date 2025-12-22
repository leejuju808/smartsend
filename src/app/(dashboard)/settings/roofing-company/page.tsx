"use client";

// Block 231000 — SmartSend Roofing Company Settings + Roles & Permissions + Team Management System
// Main Settings Page with Tabs: Company Profile, Team Members, Roles & Permissions, Branding, Templates, Notifications

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Users,
  Shield,
  Palette,
  FileText,
  Bell,
  ChevronRight,
} from "lucide-react";
import CompanyProfileTab from "./components/CompanyProfileTab";
import TeamMembersTab from "./components/TeamMembersTab";
import RolesPermissionsTab from "./components/RolesPermissionsTab";
import BrandingTab from "./components/BrandingTab";
import TemplatesTab from "./components/TemplatesTab";
import NotificationsTab from "./components/NotificationsTab";

const sections = [
  { id: "profile", label: "Company Profile", icon: Building2 },
  { id: "team", label: "Team Members", icon: Users },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "notifications", label: "Notifications", icon: Bell },
];

export default function RoofingCompanySettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<string>("profile");
  const [roofingCompanyId, setRoofingCompanyId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const section = searchParams.get("section") || "profile";
    setActiveSection(section);
  }, [searchParams]);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Get roofing company ID from URL or context
        const companyId = searchParams.get("company_id");
        if (companyId) {
          setRoofingCompanyId(companyId);
        } else {
          // Try to get from localStorage or cookie
          const stored = localStorage.getItem("current_roofing_company_id");
          if (stored) {
            setRoofingCompanyId(stored);
          }
        }

        // Get user role
        const { createClientComponentClient } = await import("@/lib/supabase");
        const supabase = createClientComponentClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        if (roofingCompanyId) {
          const { data: member } = await supabase
            .from("roofing_company_members")
            .select("role")
            .eq("roofing_company_id", roofingCompanyId)
            .eq("user_id", user.id)
            .eq("is_active", true)
            .single();

          if (member) {
            setUserRole(member.role);
          }
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router, searchParams]);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", section);
    router.push(`/settings/roofing-company?${params.toString()}`);
  };

  const canManageTeam = userRole === "owner" || userRole === "admin";
  const canEditSettings = userRole === "owner" || userRole === "admin";

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

  if (!roofingCompanyId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            No roofing company selected. Please select a company first.
          </p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (!roofingCompanyId) return null;

    switch (activeSection) {
      case "profile":
        return <CompanyProfileTab roofingCompanyId={roofingCompanyId} canEdit={canEditSettings} />;
      case "team":
        return <TeamMembersTab roofingCompanyId={roofingCompanyId} canManageTeam={canManageTeam} />;
      case "roles":
        return <RolesPermissionsTab roofingCompanyId={roofingCompanyId} canEdit={canEditSettings} />;
      case "branding":
        return <BrandingTab roofingCompanyId={roofingCompanyId} canEdit={canEditSettings} />;
      case "templates":
        return <TemplatesTab roofingCompanyId={roofingCompanyId} canEdit={canEditSettings} />;
      case "notifications":
        return <NotificationsTab roofingCompanyId={roofingCompanyId} />;
      default:
        return <CompanyProfileTab roofingCompanyId={roofingCompanyId} canEdit={canEditSettings} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Company Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your roofing company</p>
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
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className="w-5 h-5 mr-3" />
                      {section.label}
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

























