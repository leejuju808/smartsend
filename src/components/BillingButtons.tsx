// components/BillingButtons.tsx
"use client";

interface BillingButtonsProps {
  priceId?: string;
  className?: string;
}

export default function BillingButtons({ 
  priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
  className = ""
}: BillingButtonsProps) {
  const handleStartSubscription = async () => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priceId })
      });
      
      if (!res.ok) {
        throw new Error("Failed to create checkout session");
      }
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start subscription. Please try again.");
    }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch("/api/billing/portal", { 
        method: "POST" 
      });
      
      if (!res.ok) {
        throw new Error("Failed to create billing portal session");
      }
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Billing portal error:", error);
      alert("Failed to open billing portal. Please try again.");
    }
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        className="px-4 py-2 rounded-lg bg-black text-white hover:bg-gray-800 transition-colors"
        onClick={handleStartSubscription}
      >
        Start subscription
      </button>
      <button
        className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        onClick={handleManageBilling}
      >
        Manage billing
      </button>
    </div>
  );
}