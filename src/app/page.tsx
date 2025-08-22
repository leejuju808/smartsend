import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex flex-col">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center py-24 px-6">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
          SmartSendAI
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          Automate your cold email outreach, book more meetings, and grow revenue —
          all in one simple dashboard.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/signup"
            className="px-6 py-3 rounded-xl bg-black text-white text-lg font-semibold shadow hover:opacity-90 transition"
          >
            Get Started Free
          </Link>
          <Link
            href="/pricing"
            className="px-6 py-3 rounded-xl border border-gray-300 text-lg font-semibold hover:bg-gray-100 transition"
          >
            See Pricing
          </Link>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-12 px-6 bg-white text-center">
        <p className="text-gray-500 uppercase tracking-wide text-sm font-medium">
          Trusted by growing teams
        </p>
        <div className="mt-6 flex justify-center gap-8 text-gray-400">
          <span className="text-xl font-bold">🚀 StartupOne</span>
          <span className="text-xl font-bold">📈 GrowthCo</span>
          <span className="text-xl font-bold">🤖 AI Labs</span>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-6 bg-gray-50" id="pricing">
        <h2 className="text-3xl font-bold text-center text-gray-900">
          Simple Pricing
        </h2>
        <p className="mt-4 text-center text-gray-600">
          Start free, upgrade when you’re ready to scale.
        </p>
        <div className="mt-12 flex flex-col sm:flex-row justify-center gap-8">
          {/* Free Plan */}
          <div className="w-full sm:w-80 border rounded-2xl p-6 bg-white shadow hover:shadow-lg transition">
            <h3 className="text-xl font-semibold">Free</h3>
            <p className="mt-2 text-gray-600">For testing & getting started</p>
            <p className="mt-6 text-4xl font-bold">$0</p>
            <Link
              href="/signup"
              className="mt-6 block px-6 py-3 rounded-xl bg-black text-white font-semibold text-center hover:opacity-90"
            >
              Get Started
            </Link>
          </div>

          {/* Pro Plan */}
          <div className="w-full sm:w-80 border-2 border-black rounded-2xl p-6 bg-white shadow-xl">
            <h3 className="text-xl font-semibold">Pro</h3>
            <p className="mt-2 text-gray-600">For teams ready to grow</p>
            <p className="mt-6 text-4xl font-bold">$29<span className="text-lg">/mo</span></p>
            <Link
              href="/signup"
              className="mt-6 block px-6 py-3 rounded-xl bg-black text-white font-semibold text-center hover:opacity-90"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center text-gray-500 text-sm">
        © {new Date().getFullYear()} SmartSendAI. All rights reserved.
      </footer>
    </main>
  )
}
