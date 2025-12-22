// Block 87000 — Phone Settings Page
// Configure AI assistant, text-back, storm mode, and business hours

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import PhoneSettingsClient from "./PhoneSettingsClient";

export const metadata: Metadata = {
  title: "Phone Settings · SmartSend",
};

export default async function PhoneSettingsPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  // Fetch phone settings
  const { data: phoneSettings } = await supabase
    .from("ai_phone_settings")
    .select("*")
    .or(`workspace_id.eq.${workspaceId}`)
    .single();

  // Fetch phone numbers
  const { data: phoneNumbers } = await supabase
    .from("phone_numbers")
    .select("*")
    .or(`workspace_id.eq.${workspaceId}`)
    .eq("is_active", true);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Phone Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your 24/7 phone assistant
          </p>
        </div>
        <a
          href="/phone"
          className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
        >
          Back to Dashboard
        </a>
      </header>

      <PhoneSettingsClient
        initialSettings={phoneSettings}
        phoneNumbers={phoneNumbers || []}
        workspaceId={workspaceId}
      />
    </div>
  );
}



























