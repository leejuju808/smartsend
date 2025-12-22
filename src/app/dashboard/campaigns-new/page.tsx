"use client";

import { useState } from "react";
import Link from "next/link";

export default function CampaignsNewPage() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [fromEmail, setFromEmail] = useState("SmartSend <no-reply@yourdomain.com>");
  const [createdCampaign, setCreatedCampaign] = useState<any>(null);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !fromEmail) {
      setError("All fields are required.");
      return;
    }

    try {
      const resp = await fetch("/api/campaigns-new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject,
          body_text: bodyText,
          from_email: fromEmail,
        }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || resp.statusText);
      }

      const result = await resp.json();
      setCreatedCampaign(result.campaign);
      setError("");
      
      // Reset form
      setName("");
      setSubject("");
      setBodyText("");
    } catch (e: any) {
      setError("Error creating campaign: " + e.message);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">New Campaign System</h1>
        <p className="text-gray-600 mt-2">
          Test the new simplified campaign system with direct email sending.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Campaign Form */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Create Campaign</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My Test Campaign"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Check out our new product!"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Email
              </label>
              <input
                type="text"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="SmartSend <no-reply@yourdomain.com>"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Body (Text)
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Hi there! I wanted to reach out about..."
                required
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Create Campaign
            </button>
          </form>
        </div>

        {/* Campaign Actions */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Campaign Actions</h2>
          
          {createdCampaign ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <h3 className="font-medium text-green-800">Campaign Created!</h3>
              <p className="text-sm text-green-600 mt-1">
                ID: {createdCampaign.id}
              </p>
              <p className="text-sm text-green-600">
                Status: {createdCampaign.status}
              </p>
              
              <div className="mt-4 space-y-2">
                <Link
                  href={`/dashboard/campaigns-new/${createdCampaign.id}/prepare`}
                  className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-md hover:bg-blue-700"
                >
                  Prepare Recipients
                </Link>
                
                <Link
                  href={`/dashboard/campaigns-new/${createdCampaign.id}/send`}
                  className="block w-full px-4 py-2 bg-green-600 text-white text-center rounded-md hover:bg-green-700"
                >
                  Send Campaign
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-sm text-gray-600">
                Create a campaign first to see available actions.
              </p>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="font-medium text-blue-800">Quick Test</h3>
            <p className="text-sm text-blue-600 mt-1">
              This system works alongside your existing campaigns. Use it to test:
            </p>
            <ul className="text-sm text-blue-600 mt-2 list-disc list-inside space-y-1">
              <li>Direct email sending</li>
              <li>Batch processing</li>
              <li>Progress tracking</li>
              <li>Pause/resume/cancel</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="font-medium text-yellow-800">Environment Setup</h3>
        <p className="text-sm text-yellow-600 mt-1">
          Make sure you have these environment variables set in your <code>.env.local</code>:
        </p>
        <pre className="text-xs text-yellow-700 mt-2 bg-yellow-100 p-2 rounded overflow-x-auto">
{`EMAIL_PROVIDER=dev
EMAIL_FROM="SmartSend <no-reply@yourdomain.com>"
BREVO_API_KEY=replace_me
MAILERSEND_TOKEN=replace_me`}
        </pre>
      </div>
    </main>
  );
} 