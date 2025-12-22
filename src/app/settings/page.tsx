"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Settings as SettingsIcon,
  Building2,
  Users,
  Mail,
  CreditCard,
  Bell,
  AlertTriangle,
  ChevronRight,
  BellRing,
} from "lucide-react";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase";
import OrganizationSettings from "./components/OrganizationSettings";
import UsersSettings from "./components/UsersSettings";
import EmailSettings from "./components/EmailSettings";
import BillingSettings from "./components/BillingSettings";
import PreferencesSettings from "./components/PreferencesSettings";
import DangerZoneSettings from "./components/DangerZoneSettings";

const sections = [
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "sending", label: "Sending", icon: Mail },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "preferences", label: "Preferences", icon: Bell },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<string>("organization");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const section = searchParams.get("section") || "organization";
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

        // Get current org and user role
        const cookieStore = document.cookie
          .split("; ")
          .find((row) => row.startsWith("current_org_id=") || row.startsWith("org_id="));
        const orgId = cookieStore?.split("=")[1];

        if (orgId) {
          const { data: membership } = await supabase
            .from("org_memberships")
            .select("role")
            .eq("org_id", orgId)
            .eq("user_id", user.id)
            .eq("status", "active")
            .maybeSingle();

          setUserRole(membership?.role || null);
        }
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
    router.push(`/settings?section=${section}`);
  };

  const canEdit = userRole === "owner" || userRole === "admin" || userRole === "manager";
  const isOwner = userRole === "owner";

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

  const renderContent = () => {
    switch (activeSection) {
      case "organization":
        return <OrganizationSettings canEdit={canEdit} />;
      case "users":
        return <UsersSettings canEdit={canEdit} />;
      case "sending":
        return <EmailSettings canEdit={canEdit} />;
      case "billing":
        return <BillingSettings canEdit={canEdit} />;
      case "preferences":
        return <PreferencesSettings canEdit={canEdit} />;
      case "danger":
        return <DangerZoneSettings canEdit={isOwner} />;
      default:
        return <OrganizationSettings canEdit={canEdit} />;
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
              Read-only mode. Only Owners/Managers can edit.
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
            <li>
              <Link
                href="/settings/notifications"
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:bg-gray-50"
              >
                <BellRing className="h-5 w-5" />
                <span className="flex-1 text-left">Notifications</span>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Changes apply to entire organization. Only Owners/Managers can edit.
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





