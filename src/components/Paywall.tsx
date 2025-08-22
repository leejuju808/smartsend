"use client";

export default function Paywall() {
  const goUpgrade = () => (window.location.href = "/api/stripe/checkout?interval=monthly");
  const goPortal = async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <div className="mx-auto max-w-xl rounded-2xl border p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">Unlock Pro</h2>
      <p className="mt-2 text-sm text-gray-600">
        This feature requires a Pro subscription.
      </p>
      <div className="mt-4 flex gap-3">
        <button onClick={goUpgrade} className="rounded-2xl px-4 py-2 bg-black text-white">
          Upgrade to Pro
        </button>
        <button onClick={goPortal} className="rounded-2xl px-4 py-2 border">
          Manage billing
        </button>
      </div>
    </div>
  );
}

