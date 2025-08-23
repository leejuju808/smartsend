export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20 text-center space-y-16">
      <h2 className="text-4xl font-bold">Pricing</h2>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="border rounded-2xl p-8 space-y-6">
          <h3 className="text-xl font-semibold">Free</h3>
          <p className="text-gray-600">Try SmartSendAI with limited credits.</p>
          <ul className="text-sm space-y-2 text-gray-500">
            <li>✔ 50 contacts</li>
            <li>✔ 10 AI replies</li>
            <li>✖ No automations</li>
          </ul>
          <a href="/signup" className="block w-full py-3 rounded bg-gray-100 font-medium">
            Start Free
          </a>
        </div>

        <div className="border rounded-2xl p-8 space-y-6 shadow-lg">
          <h3 className="text-xl font-semibold">Pro</h3>
          <p className="text-gray-600">7-day free trial, then $49/month.</p>
          <ul className="text-sm space-y-2 text-gray-500">
            <li>✔ Unlimited contacts</li>
            <li>✔ Unlimited AI replies</li>
            <li>✔ CSV import + suppression</li>
            <li>✔ Meeting auto-insert</li>
          </ul>
          <a
            href="/dashboard/billing?upgrade=1"
            className="block w-full py-3 rounded bg-black text-white font-medium"
          >
            Start Free Trial → 
          </a>
        </div>
      </div>
    </div>
  );
} 