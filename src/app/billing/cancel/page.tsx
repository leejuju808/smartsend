// app/billing/cancel/page.tsx
import Link from "next/link";
import BillingButtons from "@/components/BillingButtons";

export default function BillingCancelPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 text-center">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8">
        <div className="text-yellow-600 text-6xl mb-4">⚠</div>
        <h1 className="text-2xl font-bold text-yellow-800 mb-4">
          Subscription Cancelled
        </h1>
        <p className="text-yellow-700 mb-6">
          Your subscription setup was cancelled. You can try again anytime or contact support if you need help.
        </p>
        <div className="space-x-4">
          <BillingButtons />
          <Link 
            href="/dashboard" 
            className="inline-block border border-yellow-600 text-yellow-600 px-6 py-2 rounded-lg hover:bg-yellow-50 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}