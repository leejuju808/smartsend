"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function CampaignPreparePage() {
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const prepareAllContacts = async () => {
    setLoading(true);
    setError("");
    
    try {
      const resp = await fetch(`/api/campaigns/${id}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "all_contacts" }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || resp.statusText);
      }

      const data = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError("Error preparing campaign: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const prepareCustomEmails = async () => {
    const emails = prompt("Enter email addresses separated by commas:");
    if (!emails) return;

    setLoading(true);
    setError("");
    
    try {
      const emailList = emails.split(",").map(e => e.trim()).filter(Boolean);
      
      const resp = await fetch(`/api/campaigns/${id}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          source: "emails", 
          emails: emailList 
        }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || resp.statusText);
      }

      const data = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError("Error preparing campaign: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Prepare Campaign Recipients</h1>
        <p className="text-sm text-gray-600">Campaign ID: {id}</p>
      </header>

      <div className="space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h3 className="font-medium text-blue-800">Choose Recipient Source</h3>
          <p className="text-sm text-blue-600 mt-1">
            Select where to get your recipient list from.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={prepareAllContacts}
            disabled={loading}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">👥</div>
              <h3 className="font-medium">All Contacts</h3>
              <p className="text-sm text-gray-600">Use all contacts from your database</p>
            </div>
          </button>

          <button
            onClick={prepareCustomEmails}
            disabled={loading}
            className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <div className="text-center">
              <div className="text-2xl mb-2">✉️</div>
              <h3 className="font-medium">Custom Emails</h3>
              <p className="text-sm text-gray-600">Enter specific email addresses</p>
            </div>
          </button>
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Preparing recipients...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {result && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="font-medium text-green-800">Recipients Prepared!</h3>
            <div className="mt-2 space-y-1 text-sm text-green-600">
              <p>Total: {result.total}</p>
              <p>Suppressed: {result.suppressed}</p>
              <p>Ready to send: {result.total - result.suppressed}</p>
            </div>
            
            <div className="mt-4">
              <Link
                href={`/dashboard/campaigns-new/${id}/send`}
                className="inline-block px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Go to Send Console →
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="pt-6 border-t">
        <Link
          href={`/dashboard/campaigns-new/${id}`}
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Campaign
        </Link>
      </div>
    </main>
  );
} 