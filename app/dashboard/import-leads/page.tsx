"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CSVImporter from "@/components/CSVImporter";
import { createClientComponentClient } from "@supabase/ssr";

export default function ImportLeadsPage() {
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const getWorkspaceId = async () => {
      // Try to get from URL params first
      const wsFromUrl = searchParams?.get("ws");
      
      // If not in URL, try localStorage
      const wsFromStorage = typeof window !== "undefined" 
        ? localStorage.getItem('active_workspace') 
        : null;
      
      // If still not found, get user's first workspace
      if (!wsFromUrl && !wsFromStorage) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
          
          if (data) {
            setWorkspaceId(data.workspace_id);
            setLoading(false);
            return;
          }
        }
      }
      
      setWorkspaceId(wsFromUrl || wsFromStorage);
      setLoading(false);
    };

    getWorkspaceId();
  }, [searchParams, supabase]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading...</div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: No workspace found. Please create a workspace first.</div>
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Import Leads</h1>
      <p className="text-gray-600 mb-6">Upload a CSV file to import leads into your workspace.</p>
      <CSVImporter workspaceId={workspaceId} />
    </main>
  );
}
