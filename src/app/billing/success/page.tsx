// app/billing/success/page.tsx
import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 text-center">
      <div className="bg-green-50 border border-green-200 rounded-lg p-8">
        <div className="text-green-600 text-6xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-green-800 mb-4">
          Subscription Activated!
        </h1>
        <p className="text-green-700 mb-6">
          Your subscription has been successfully activated. You now have access to all premium features.
        </p>
        <div className="space-x-4">
          <Link 
            href="/dashboard" 
            className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link 
            href="/billing" 
            className="inline-block border border-green-600 text-green-600 px-6 py-2 rounded-lg hover:bg-green-50 transition-colors"
          >
            Manage Billing
          </Link>
        </div>
      </div>
    </div>
  );
}