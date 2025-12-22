import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const metadata = {
  title: "We Built the AI Operating System for SMBs — Here's Why | AUREV HQ",
  description: "AUREV HQ was born from a simple frustration: founders shouldn't waste hours gluing tools together. AI should just handle it.",
  openGraph: {
    title: "We Built the AI Operating System for SMBs — Here's Why",
    description: "The story behind AUREV HQ and why we're building the first truly unified AI automation platform.",
  },
};

export default function LaunchBlogPost() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <article className="max-w-4xl mx-auto px-6 py-24">
        {/* Header */}
        <div className="space-y-4 mb-16">
          <Link href="/blog" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm">
            ← Back to Blog
          </Link>
          
          <div className="space-y-2">
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
              We Built the AI Operating System for SMBs — Here's Why ⚡
            </h1>
            <div className="flex items-center gap-4 text-gray-400 pt-4">
              <span>January 15, 2025</span>
              <span>•</span>
              <span>5 min read</span>
              <span>•</span>
              <span>Julian Lee, Founder & CEO</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="prose prose-invert prose-xl max-w-none space-y-8">
          <div className="text-xl text-gray-300 leading-relaxed">
            <p>
              AUREV HQ was born from a simple frustration: <strong>founders shouldn't waste hours gluing tools together — AI should just handle it.</strong>
            </p>
          </div>

          <h2 className="text-4xl font-bold pt-8">The Problem: Tool Fragmentation Hell</h2>
          
          <p className="text-lg leading-relaxed">
            Every founder I know has the same setup:
          </p>

          <ul className="space-y-3 text-lg list-disc pl-6">
            <li>Lead management in Google Sheets</li>
            <li>Email campaigns in Outreach or Lemlist</li>
            <li>CRM in HubSpot or Salesforce</li>
            <li>Task automation in Zapier or Make.com</li>
            <li>AI agents scattered across GitHub</li>
          </ul>

          <p className="text-lg leading-relaxed">
            They spend <strong>10+ hours per week</strong> copy-pasting data between platforms, debugging broken integrations, and manually stitching workflows. That's time they should be spending on product, customers, or revenue.
          </p>

          <h2 className="text-4xl font-bold pt-8">The Vision: One Intelligent System</h2>

          <p className="text-lg leading-relaxed">
            We built AUREV HQ as the antidote: <strong>the first AI Operating System that unifies outreach, operations, and agents into one connected ecosystem.</strong>
          </p>

          <div className="bg-gray-900 border border-amber-500/30 rounded-2xl p-8 my-12">
            <h3 className="text-2xl font-bold mb-4 text-amber-400">What Makes It an "OS"?</h3>
            <p className="text-lg leading-relaxed">
              Unlike point solutions, AUREV HQ is architected from the ground up as a unified intelligence layer:
            </p>
            <ul className="space-y-3 text-lg list-disc pl-6 mt-4">
              <li><strong>One database:</strong> All apps share the same schema and real-time sync</li>
              <li><strong>One auth system:</strong> JWT with org_id propagates across all modules</li>
              <li><strong>One billing system:</strong> Unified subscriptions, usage tracking, and revenue</li>
              <li><strong>One analytics layer:</strong> Cross-app metrics, events, and insights</li>
            </ul>
          </div>

          <h2 className="text-4xl font-bold pt-8">Meet the Ecosystem</h2>

          <div className="space-y-8 pt-4">
            {/* SmartSend */}
            <div className="border border-gray-800 rounded-2xl p-8 bg-gray-950/50">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">📧</span>
                <h3 className="text-2xl font-bold">SmartSend: Cold Email Automation</h3>
              </div>
              <p className="text-lg leading-relaxed">
                The unified inbox for all replies. AI-powered follow-ups. Campaign builder with templates. 
                Reply detection that pauses sequences automatically. No more switching tabs to check for responses.
              </p>
            </div>

            {/* OpsGrid */}
            <div className="border border-gray-800 rounded-2xl p-8 bg-gray-950/50">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚙️</span>
                <h3 className="text-2xl font-bold">OpsGrid: CRM & Workflow Automation</h3>
              </div>
              <p className="text-lg leading-relaxed">
                Contact management, deal pipelines, workflow builder. Everything SmartSend touches flows here. 
                No manual imports. No duplicate data. Just intelligent sync.
              </p>
            </div>

            {/* Agent Cloud */}
            <div className="border border-gray-800 rounded-2xl p-8 bg-gray-950/50">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🤖</span>
                <h3 className="text-2xl font-bold">Agent Cloud: Deployable AI Agents</h3>
              </div>
              <p className="text-lg leading-relaxed">
                Marketplace of pre-built agents. Custom agent builder. When a lead replies in SmartSend, 
                an agent can auto-follow-up in OpsGrid. Cross-app automation that just works.
              </p>
            </div>
          </div>

          <h2 className="text-4xl font-bold pt-8">The Traction: $85K MRR and Growing</h2>

          <p className="text-lg leading-relaxed">
            We launched AUREV HQ publicly with <strong>100+ organizations</strong> and <strong>$85,000+ in monthly recurring revenue</strong>. 
            The traction validated our core thesis: founders want fewer tools, not more integrations.
          </p>

          <div className="grid md:grid-cols-3 gap-6 my-12">
            <div className="text-center p-6 border border-gray-800 rounded-xl bg-gray-900">
              <div className="text-4xl font-bold text-amber-400 mb-2">100+</div>
              <div className="text-gray-400">Organizations</div>
            </div>
            <div className="text-center p-6 border border-gray-800 rounded-xl bg-gray-900">
              <div className="text-4xl font-bold text-amber-400 mb-2">$85K+</div>
              <div className="text-gray-400">Monthly Revenue</div>
            </div>
            <div className="text-center p-6 border border-gray-800 rounded-xl bg-gray-900">
              <div className="text-4xl font-bold text-amber-400 mb-2">4hrs+</div>
              <div className="text-gray-400">Saved/Day</div>
            </div>
          </div>

          <p className="text-lg leading-relaxed">
            Customers report saving <strong>4+ hours per day</strong> by eliminating context-switching and manual workflows. 
            That's the real ROI: time for what matters.
          </p>

          <h2 className="text-4xl font-bold pt-8">What's Next: The AI OS Movement</h2>

          <p className="text-lg leading-relaxed">
            We're just getting started. The vision is clear:
          </p>

          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-l-4 border-amber-500 p-6 rounded-r-xl my-8">
            <p className="text-xl font-bold mb-2">"Where Intelligent Automation Meets Execution"</p>
            <p className="text-gray-300">
              AUREV HQ is the AI Operating System for the next era of operators. No more tool sprawl. 
              No more manual glue work. Just intelligent automation that runs your business while you sleep.
            </p>
          </div>

          <h3 className="text-2xl font-bold pt-6">Roadmap</h3>
          <ul className="space-y-3 text-lg list-disc pl-6">
            <li><strong>More connectors:</strong> LinkedIn, SMS, WhatsApp automation</li>
            <li><strong>Advanced agents:</strong> Multi-agent orchestration, custom model training</li>
            <li><strong>Enterprise features:</strong> SSO, audit logs, advanced permissions</li>
            <li><strong>Marketplace:</strong> Third-party agents, templates, integrations</li>
          </ul>

          <h2 className="text-4xl font-bold pt-8">Join Us</h2>

          <p className="text-lg leading-relaxed">
            If you're a founder drowning in tools, agency owner managing clients across platforms, 
            or operator building the next generation of business automation — <strong>we're building this for you.</strong>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-6">
            <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-black font-bold">
              Try AUREV HQ Free
            </Button>
            <Button size="lg" variant="outline" className="border-amber-500 text-amber-400 hover:bg-amber-500/10">
              Book a Demo
            </Button>
          </div>

          <div className="border-t border-gray-800 pt-12 mt-16">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-2xl font-bold">
                JL
              </div>
              <div>
                <div className="font-bold text-xl">Julian Lee</div>
                <div className="text-gray-400">Founder & CEO of AUREV HQ</div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

