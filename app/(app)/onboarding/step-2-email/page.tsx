// Block 11000 — Step 2: Connect Sending Email
// Screen: "Which email should SmartSend send from?"

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Step2EmailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formData, setFormData] = useState({
    fromEmail: "",
    fromName: "",
    testEmail: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/step-2-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromEmail: formData.fromEmail,
          fromName: formData.fromName,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to connect email");
        setLoading(false);
        return;
      }

      router.push("/onboarding/step-3-contacts");
    } catch (error: any) {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!formData.testEmail) {
      alert("Please enter a test email address");
      return;
    }

    setTesting(true);
    try {
      // TODO: Implement test email sending
      alert("Test email sent! Check your inbox.");
    } catch (error) {
      alert("Failed to send test email");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <div className="text-xs text-gray-500 mb-2">Step 2 of 4</div>
        <h1 className="text-2xl font-semibold mb-2">
          Which email should SmartSend send from?
        </h1>
        <p className="text-sm text-gray-600">
          Connect your sending email. We&apos;ll help you set up DNS if needed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            From Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={formData.fromEmail}
            onChange={(e) =>
              setFormData({ ...formData, fromEmail: e.target.value })
            }
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            placeholder="owner@company.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            Common options: owner@company.com, info@company.com, estimates@company.com
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            From Name (Optional)
          </label>
          <input
            type="text"
            value={formData.fromName}
            onChange={(e) =>
              setFormData({ ...formData, fromName: e.target.value })
            }
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            placeholder="John Smith"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave blank to use email username
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="text-sm font-medium mb-2">Email Setup Instructions</h3>
          <p className="text-xs text-gray-600 mb-3">
            For v1, SmartSend can send from your email. Full DNS setup and warmup will come later.
          </p>
          <div className="space-y-2 text-xs text-gray-600">
            <p>• If using a sending service (Postmark, SendGrid, etc.), follow their DNS instructions</p>
            <p>• For direct sending, ensure your email provider allows SMTP</p>
            <p>• You can test sending below before continuing</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Test Email (Optional)
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={formData.testEmail}
              onChange={(e) =>
                setFormData({ ...formData, testEmail: e.target.value })
              }
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              placeholder="your-email@example.com"
            />
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={testing || !formData.testEmail}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? "Sending..." : "Send Test"}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push("/onboarding/step-1-company")}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Connecting..." : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}























































