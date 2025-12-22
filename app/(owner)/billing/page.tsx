"use client";

export default function BillingPage() {
  async function openPortal() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No portal URL returned", data);
        alert("Failed to open billing portal. Please try again.");
      }
    } catch (error) {
      console.error("Error opening portal:", error);
      alert("Failed to open billing portal. Please try again.");
    }
  }

  return (
    <div className="space-y-4 max-w-lg p-6">
      <h1 className="text-lg font-semibold">Billing & Plan</h1>
      <p className="text-sm text-gray-600">
        Manage your subscription, update payment methods, and upgrade your plan.
      </p>

      <button
        onClick={openPortal}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        Manage / Upgrade Plan
      </button>
    </div>
  );
}














































