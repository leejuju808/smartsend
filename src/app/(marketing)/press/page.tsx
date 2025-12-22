export default function PressPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <div className="inline-block bg-amber-100 text-amber-900 px-4 py-2 rounded-lg text-sm font-semibold mb-4">
          🚀 SmartSend v3 Relaunch Press Kit
        </div>
        <h1 className="text-4xl font-bold mb-2">Press & Media</h1>
        <p className="text-gray-600">SmartSend AI v3 — Now part of AUREV HQ</p>
      </div>
      
      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-semibold mb-4">About SmartSend AI v3</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            <strong>SmartSend AI</strong> is The Autonomous Outreach OS — the first platform that finds leads, 
            writes messages, and replies intelligently on autopilot. Fully autonomous outreach across 
            email, LinkedIn, and WhatsApp from one AI-powered dashboard.
          </p>
          <p className="text-gray-700 leading-relaxed mb-4">
            SmartSend AI is now part of <strong>AUREV HQ</strong>, the complete AI Business Suite for builders.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mt-4">
            <h3 className="font-semibold mb-2">Key Metrics (v3)</h3>
            <ul className="list-disc list-inside text-gray-700 space-y-1 text-sm">
              <li>Multi-channel autonomous outreach (Email, LinkedIn, WhatsApp)</li>
              <li>AI Prospector automatically finds and qualifies leads</li>
              <li>Outreach Composer generates personalized messages at scale</li>
              <li>Reply Handler books demos intelligently</li>
              <li>Autopilot Dashboard for complete outreach orchestration</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">v3 Relaunch Media Assets</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <a 
              href="/assets/v3-dashboard-screenshot.png" 
              download
              className="border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-50 transition-colors"
            >
              <h3 className="font-semibold mb-2">v3 Dashboard Screenshot</h3>
              <p className="text-sm text-gray-600">High-res autopilot dashboard view</p>
            </a>
            <a 
              href="/assets/v3-ai-demo-video.mp4" 
              download
              className="border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-50 transition-colors"
            >
              <h3 className="font-semibold mb-2">60-Second AI Demo Video</h3>
              <p className="text-sm text-gray-600">Product walkthrough showing autonomous features</p>
            </a>
            <a 
              href="/assets/v3-screenshots-pack.zip" 
              download
              className="border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-50 transition-colors"
            >
              <h3 className="font-semibold mb-2">v3 Screenshots Pack</h3>
              <p className="text-sm text-gray-600">AI Prospector, Outreach Composer, Reply Handler views</p>
            </a>
            <a 
              href="/assets/smartsend-aurev-logo.zip" 
              download
              className="border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-50 transition-colors"
            >
              <h3 className="font-semibold mb-2">Logo Package (AUREV HQ)</h3>
              <p className="text-sm text-gray-600">SmartSend + AUREV HQ logos in all formats</p>
            </a>
            <a 
              href="/assets/v3-metrics-card.png" 
              download
              className="border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-50 transition-colors"
            >
              <h3 className="font-semibold mb-2">Updated Metrics Card</h3>
              <p className="text-sm text-gray-600">MRR, retention, user growth stats</p>
            </a>
            <a 
              href="/assets/aurev-hq-press-kit.pdf" 
              download
              className="border-2 border-amber-200 rounded-lg p-4 hover:bg-amber-50 transition-colors"
            >
              <h3 className="font-semibold mb-2">AUREV HQ Brand Guidelines</h3>
              <p className="text-sm text-gray-600">Complete brand identity and usage guide</p>
            </a>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Press Contact</h2>
          <p className="text-gray-700 mb-2">
            For press inquiries, interviews, or media requests, please contact:
          </p>
          <p className="text-gray-700">
            <a href="mailto:press@smartsendhq.com" className="text-blue-600 hover:underline font-semibold">
              press@smartsendhq.com
            </a>
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Response time: Within 24 hours
          </p>
        </section>

        <section className="border-t pt-8">
          <h2 className="text-2xl font-semibold mb-4">Recent Updates</h2>
          <div className="space-y-4">
            <div className="border-l-4 border-amber-500 pl-4 bg-amber-50 p-4 rounded-r-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🚀</span>
                <h3 className="font-semibold">SmartSend v3 Relaunch - Jan 2025</h3>
              </div>
              <p className="text-sm text-gray-700 mt-1 mb-2">
                <strong>The Autonomous Outreach OS</strong> — Now part of AUREV HQ
              </p>
              <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                <li>Fully autonomous lead finding, messaging, and reply handling</li>
                <li>AI Prospector generates qualified leads automatically</li>
                <li>Multi-channel outreach (Email, LinkedIn, WhatsApp)</li>
                <li>Intelligent reply handling with demo booking automation</li>
                <li>Complete integration into AUREV HQ suite</li>
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Product Hunt launch: <a href="https://producthunt.com" className="underline">View launch</a>
              </p>
            </div>
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-semibold">SmartSend v2 Launch - Jan 2025</h3>
              <p className="text-sm text-gray-600 mt-1">
                Multi-channel support: Email, LinkedIn, WhatsApp
              </p>
            </div>
          </div>
        </section>

        <section className="border-t pt-8 bg-gray-50 p-6 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">AUREV HQ</h2>
          <p className="text-gray-700 mb-4">
            SmartSend AI is part of <strong>AUREV HQ</strong> — The AI Business Suite for builders. 
            AUREV HQ provides a complete ecosystem of AI-powered tools for modern businesses.
          </p>
          <p className="text-sm text-gray-600">
            For more information about AUREV HQ, visit: <a href="https://aurevhq.com" className="text-blue-600 hover:underline">aurevhq.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}

