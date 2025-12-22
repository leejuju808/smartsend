// src/app/dashboard/campaigns/NewCampaign.tsx
"use client";
import { useState } from "react";
import { createCampaignAndQueue } from "./actions";

interface NewCampaignProps {
  workspaceId: string;
  onSuccess?: () => void;
}

export default function NewCampaign({ workspaceId, onSuccess }: NewCampaignProps) {
  const [name, setName] = useState("");
  const [scheduledFor, setScheduledFor] = useState(""); // ISO local
  const [recipientsJson, setRecipientsJson] = useState(`[
  {"email":"alice@example.com","subject":"Hey Alice","body":"Hi {{first_name}},<br><br>I hope this email finds you well. I wanted to reach out about...<br><br>Best regards,<br>Your Name"},
  {"email":"bob@example.com","subject":"Quick question","body":"Hi {{first_name}},<br><br>I have a quick question about...<br><br>Thanks,<br>Your Name"}
]`);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onCreate() {
    if (!name.trim()) {
      setError("Campaign name is required");
      return;
    }
    if (!scheduledFor) {
      setError("Scheduled time is required");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const recipients = JSON.parse(recipientsJson);
      
      if (!Array.isArray(recipients) || recipients.length === 0) {
        throw new Error("Recipients must be a non-empty array");
      }

      // Validate recipients
      for (const recipient of recipients) {
        if (!recipient.email || !recipient.subject || !recipient.body) {
          throw new Error("Each recipient must have email, subject, and body");
        }
        if (!recipient.email.includes("@")) {
          throw new Error(`Invalid email: ${recipient.email}`);
        }
      }

      const result = await createCampaignAndQueue({
        workspaceId,
        name,
        scheduledFor: new Date(scheduledFor).toISOString(),
        recipients,
      });

      setSuccess(result.message);
      setName("");
      setScheduledFor("");
      setRecipientsJson(`[
  {"email":"","subject":"","body":""}
]`);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <h2 className="text-xl font-semibold">🗓️ Schedule New Campaign</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Campaign Name
          </label>
          <input 
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Q1 Outreach Campaign"
            value={name} 
            onChange={(e) => setName(e.target.value)} 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Scheduled For
          </label>
          <input 
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="datetime-local"
            value={scheduledFor} 
            onChange={(e) => setScheduledFor(e.target.value)} 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Recipients (JSON Format)
          </label>
          <textarea 
            className="w-full border border-gray-300 rounded-md px-3 py-2 h-40 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={recipientsJson} 
            onChange={(e) => setRecipientsJson(e.target.value)}
            placeholder="Enter recipients in JSON format..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Each recipient needs: email, subject, body. Use HTML for formatting.
          </p>
        </div>

        <button 
          onClick={onCreate} 
          disabled={isLoading}
          className="w-full px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Creating Campaign..." : "Schedule Campaign"}
        </button>
      </div>
    </div>
  );
}