export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24 text-center space-y-8">
      <h1 className="text-5xl font-bold">
        Cold email outreach that <span className="text-blue-600">books meetings</span>.
      </h1>
      <p className="text-lg text-gray-600 max-w-2xl mx-auto">
        SmartSendAI writes replies, inserts Calendly links, and scales to thousands of leads —
        so you focus on closing deals, not chasing inboxes.
      </p>
      <div className="flex justify-center gap-4">
        <a href="/pricing" className="px-6 py-3 rounded bg-black text-white font-medium">
          Get Started →
        </a>
        <a href="/login" className="px-6 py-3 rounded border font-medium">
          Log In
        </a>
      </div>
    </div>
  );
} 