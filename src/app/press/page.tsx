import Link from "next/link";
import { Button } from "@/components/ui/Button";

export const metadata = {
  title: "Press & Media Kit | AUREV HQ",
  description: "Download brand assets, press releases, and media resources for AUREV HQ — The AI Operating System for SMBs.",
};

export default function PressPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold">AUREV HQ ⚡ — Press & Media Kit</h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            The AI Operating System for Modern Business Automation
          </p>
        </div>

        {/* Quick Facts */}
        <section className="space-y-6 bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h2 className="text-3xl font-semibold">Quick Facts</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-4 border border-gray-800 rounded-xl">
              <div className="text-3xl font-bold text-amber-400 mb-2">100+</div>
              <div className="text-sm text-gray-400">Organizations</div>
            </div>
            <div className="text-center p-4 border border-gray-800 rounded-xl">
              <div className="text-3xl font-bold text-amber-400 mb-2">$85K+</div>
              <div className="text-sm text-gray-400">Monthly Revenue</div>
            </div>
            <div className="text-center p-4 border border-gray-800 rounded-xl">
              <div className="text-3xl font-bold text-amber-400 mb-2">3</div>
              <div className="text-sm text-gray-400">Interconnected Apps</div>
            </div>
          </div>
        </section>

        {/* Press Summary */}
        <section className="space-y-4 bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h2 className="text-3xl font-semibold">About AUREV HQ</h2>
          <div className="space-y-4 text-gray-300 leading-relaxed">
            <p>
              AUREV HQ is the first AI Operating System for SMBs — a unified platform that connects three 
              intelligent apps: SmartSend (cold email automation), OpsGrid (CRM & workflows), and Agent Cloud (AI agents).
            </p>
            <p>
              Unlike fragmented tool ecosystems, AUREV HQ shares one database, one auth system, and one intelligence layer. 
              Data flows seamlessly between apps. Events trigger actions across modules. Customers save 4+ hours per day.
            </p>
          </div>
        </section>

        {/* Founder Quote */}
        <section className="bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-l-4 border-amber-500 p-8 rounded-r-xl">
          <blockquote className="text-xl leading-relaxed font-medium">
            "We built AUREV HQ because founders shouldn't waste hours gluing tools together — AI should just handle it."
          </blockquote>
          <cite className="block mt-4 text-gray-400">
            — Julian Lee, Founder & CEO of AUREV HQ
          </cite>
        </section>

        {/* Brand Assets */}
        <section className="space-y-6 bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h2 className="text-3xl font-semibold">Brand Assets</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <a 
              href="/press/aurev-logo.svg" 
              download
              className="flex items-center p-4 border border-gray-800 rounded-lg hover:border-amber-500 transition-colors bg-gray-950"
            >
              <span className="text-2xl mr-3">⚡</span>
              <div>
                <div className="font-medium">AUREV HQ Logo</div>
                <div className="text-sm text-gray-400">SVG, PNG formats</div>
              </div>
            </a>
            <a 
              href="/press/brand-guidelines.md" 
              download
              className="flex items-center p-4 border border-gray-800 rounded-lg hover:border-amber-500 transition-colors bg-gray-950"
            >
              <span className="text-2xl mr-3">📋</span>
              <div>
                <div className="font-medium">Brand Guidelines</div>
                <div className="text-sm text-gray-400">Visual identity guide</div>
              </div>
            </a>
            <a 
              href="/press/julian-headshot.jpg" 
              download
              className="flex items-center p-4 border border-gray-800 rounded-lg hover:border-amber-500 transition-colors bg-gray-950"
            >
              <span className="text-2xl mr-3">📸</span>
              <div>
                <div className="font-medium">Founder Headshot</div>
                <div className="text-sm text-gray-400">High-resolution photo</div>
              </div>
            </a>
            <a 
              href="/press/media-sheet.md" 
              download
              className="flex items-center p-4 border border-gray-800 rounded-lg hover:border-amber-500 transition-colors bg-gray-950"
            >
              <span className="text-2xl mr-3">📄</span>
              <div>
                <div className="font-medium">Media Sheet</div>
                <div className="text-sm text-gray-400">One-pager with stats</div>
              </div>
            </a>
          </div>
        </section>

        {/* Product Screenshots */}
        <section className="space-y-6 bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h2 className="text-3xl font-semibold">Product Screenshots</h2>
          <p className="text-gray-400">
            Download screenshots of AUREV HQ dashboard, SmartSend inbox, OpsGrid workflows, and Agent Cloud deployment.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { name: "AUREV HQ Dashboard", desc: "Unified metrics across all apps" },
              { name: "SmartSend Inbox", desc: "AI-powered reply management" },
              { name: "OpsGrid Workflows", desc: "CRM automation builder" },
              { name: "Agent Cloud Deploy", desc: "AI agent marketplace" },
            ].map((asset) => (
              <div 
                key={asset.name}
                className="flex items-center p-4 border border-gray-800 rounded-lg hover:border-amber-500 transition-colors bg-gray-950 cursor-pointer"
              >
                <span className="text-2xl mr-3">🖼️</span>
                <div>
                  <div className="font-medium">{asset.name}</div>
                  <div className="text-sm text-gray-400">{asset.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="space-y-4 bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h2 className="text-3xl font-semibold">Media Contact</h2>
          <p className="text-gray-400">For press, partnership, or investor inquiries:</p>
          <div className="flex flex-col gap-3">
            <a 
              href="mailto:press@aurevhq.com" 
              className="flex items-center gap-3 text-lg font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              <span className="text-2xl">📧</span>
              press@aurevhq.com
            </a>
            <div className="flex items-center gap-3 text-lg font-medium text-amber-400">
              <span className="text-2xl">🌐</span>
              aurevhq.com/press
            </div>
          </div>
        </section>

        {/* Download All */}
        <div className="flex justify-center">
          <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-black font-bold">
            Download Complete Press Kit (ZIP)
          </Button>
        </div>

        {/* Footer Links */}
        <div className="flex justify-center gap-6 text-sm text-gray-400 border-t border-gray-800 pt-8">
          <a href="/blog" className="hover:text-amber-400 transition-colors">Blog</a>
          <span>•</span>
          <a href="/pricing" className="hover:text-amber-400 transition-colors">Pricing</a>
          <span>•</span>
          <a href="/" className="hover:text-amber-400 transition-colors">Home</a>
        </div>
      </div>
    </div>
  );
}
