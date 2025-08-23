"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Cloud, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function SalesforceCard() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.team_id) {
        const { data: token } = await supabase
          .from("salesforce_tokens")
          .select("team_id")
          .eq("team_id", prof.team_id)
          .maybeSingle();

        setIsConnected(!!token);
      }
    } catch (error) {
      console.error("Error checking Salesforce connection:", error);
      setIsConnected(false);
    }
  };

  const handleSync = async () => {
    setSyncLoading(true);
    setSyncMessage(null);
    
    try {
      const response = await fetch("/api/integrations/salesforce/sync-contacts", { 
        method: "POST" 
      });
      const result = await response.json();
      
      if (result.ok) {
        setSyncMessage(`Successfully synced ${result.synced} contacts to Salesforce!`);
      } else {
        setSyncMessage("Failed to sync contacts. Please try again.");
      }
    } catch (error) {
      setSyncMessage("Error syncing contacts. Please check your connection.");
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("This will disconnect your Salesforce integration. Continue?")) return;
    
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.team_id) {
        await supabase
          .from("salesforce_tokens")
          .delete()
          .eq("team_id", prof.team_id);
        
        setIsConnected(false);
      }
    } catch (error) {
      console.error("Error disconnecting Salesforce:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Cloud className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold">Salesforce</h3>
          {isConnected && (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
        </div>
        
        {!isConnected ? (
          <a 
            href="/api/integrations/salesforce/start" 
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors"
          >
            Connect
          </a>
        ) : (
          <button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="px-3 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
          </button>
        )}
      </div>
      
      <p className="text-sm text-gray-600">
        {isConnected 
          ? "Your contacts are synced with Salesforce. AI replies are logged as Tasks."
          : "Connect your Salesforce account to sync contacts and log AI replies as Tasks."
        }
      </p>
      
      {isConnected && (
        <div className="space-y-2">
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className="px-3 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 w-full"
          >
            {syncLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            ) : (
              "Sync Contacts Now"
            )}
          </button>
          
          {syncMessage && (
            <div className={`text-sm p-2 rounded ${
              syncMessage.includes("Successfully") 
                ? "bg-green-50 text-green-700" 
                : "bg-red-50 text-red-700"
            }`}>
              {syncMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 