"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Zap } from "lucide-react";

export default function BetaInvite() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch("/api/beta/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      
      if (response.ok) {
        setSubmitted(true);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to submit. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-32 text-center space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Zap className="h-12 w-12 text-yellow-400" />
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
              AUREV OS Beta
            </h1>
          </div>
          <p className="text-2xl text-gray-400">
            Join the first AI Operating System for SMBs.
          </p>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            One dashboard for outreach, operations, and automation. 
            SmartSend, OpsGrid, and AgentCloud — unified.
          </p>
        </div>

        {/* Form */}
        {!submitted ? (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="flex-1 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              <Button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-semibold hover:from-yellow-400 hover:to-yellow-500 transition-all disabled:opacity-50"
              >
                {loading ? "Requesting..." : "Request Invite"}
              </Button>
            </div>
            <p className="text-sm text-gray-500">
              Early access to AUREV OS Beta. No spam, unsubscribe anytime.
            </p>
          </form>
        ) : (
          <div className="max-w-md mx-auto p-6 bg-gray-900/50 border border-yellow-500/50 rounded-lg">
            <p className="text-xl text-yellow-400 font-semibold">
              🎉 You're on the list!
            </p>
            <p className="text-gray-400 mt-2">
              We'll send you beta access instructions soon.
            </p>
          </div>
        )}

        {/* Features Preview */}
        <div className="grid md:grid-cols-3 gap-6 mt-16 text-left">
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-xl font-semibold text-yellow-400 mb-2">
              Outreach (SmartSend)
            </h3>
            <p className="text-gray-400">
              AI-powered cold email automation with unified inbox and smart follow-ups.
            </p>
          </div>
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-xl font-semibold text-yellow-400 mb-2">
              Operations (OpsGrid)
            </h3>
            <p className="text-gray-400">
              Workflow automation and task orchestration for your business operations.
            </p>
          </div>
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
            <h3 className="text-xl font-semibold text-yellow-400 mb-2">
              Intelligence (AgentCloud)
            </h3>
            <p className="text-gray-400">
              Deploy AI agents from the marketplace to automate any business task.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-800 text-gray-500 text-sm">
          <p>
            AUREV OS Beta • Powered by AUREV Labs •{" "}
            <a href="https://aurevhq.com" className="text-yellow-400 hover:text-yellow-500">
              Learn More
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

