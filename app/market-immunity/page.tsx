"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketImmunityPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="font-semibold">BLOCK 273300</span>
            <span className="text-white/40">•</span>
            <span>SmartSend Market Immunity Sprint</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Make outside shocks irrelevant.
          </h1>

          <p className="text-lg md:text-xl text-white/70 max-w-3xl">
            News, ads, algorithm changes, competitors — none of it decides if you
            book jobs. SmartSend runs the simple loop: <b>Inbox → human → job.</b>
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild className="bg-white text-black hover:bg-white/90">
              <Link href="/upgrade">See plans</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Link href="/beta">Request access</Link>
            </Button>
          </div>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Card
            title="1) Algorithm Independence (Silent Advantage)"
            bullets={[
              "Doesn’t depend on Google rankings.",
              "Doesn’t depend on Facebook CPMs.",
              "Doesn’t depend on platform changes, reviews, or lead marketplaces.",
              "Runs direct: inbox → human → job.",
            ]}
            kicker="Why roofers feel stupid"
            kickerText="They remember panicking over ad changes and SEO drops. SmartSend bypasses the entire circus."
          />

          <Card
            title="2) Economic Downturn Buffer"
            bullets={[
              "Outreach continues when markets slow.",
              "Follow-ups tighten instead of stopping.",
              "Reply capture stays constant.",
              "SmartSend doesn’t “wait for demand.” It creates conversations anyway.",
            ]}
            kicker="Why roofers feel stupid"
            kickerText="Downturns punish passive companies. SmartSend keeps you visible when others disappear."
          />

          <Card
            title="3) Competitor Noise Cancellation"
            bullets={[
              "Competitors drop prices? You keep booking.",
              "Competitors run promos? You keep closing calmly.",
              "Competitors flood ads? You keep talking to homeowners.",
            ]}
            kicker="Why roofers feel stupid"
            kickerText="They stop reacting to competitor behavior. Control beats reaction."
          />

          <Card
            title="4) Policy / Platform Shock Immunity"
            bullets={[
              "Ad accounts get flagged? SmartSend keeps running.",
              "Lead services shut down? SmartSend keeps running.",
              "Agencies change terms? SmartSend keeps running.",
            ]}
            kicker="Why roofers feel stupid"
            kickerText="They remember being hostage to third parties. SmartSend cuts the leash."
          />

          <Card
            title="5) Attention Scarcity Advantage"
            bullets={[
              "When everyone screams louder, SmartSend stays direct.",
              "Inbox stays quieter. Replies stand out more.",
              "Direct outreach thrives under noise.",
            ]}
            kicker="Why roofers feel stupid"
            kickerText="Crowded channels kill ROI. Direct outreach keeps working."
          />

          <Card
            title="6) “Nothing Else Affects Us” Realization"
            bullets={[
              "No matter what happens out there, this still runs.",
              "Others scramble. SmartSend users keep operating.",
              "Once you experience immunity, you never go back to dependence.",
            ]}
            kicker="The core feeling"
            kickerText="SmartSend makes the business anti-fragile to the outside world."
          />
        </div>

        <div className="mt-14 rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-bold">The promise</h2>
          <p className="mt-3 text-white/70 max-w-3xl">
            When shocks hit, others scramble. SmartSend users keep operating —
            and fragile businesses feel reckless by comparison.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button asChild className="bg-white text-black hover:bg-white/90">
              <Link href="/upgrade">Start now</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Link href="/owner">Open dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 text-xs text-white/40">
          This page is internal copy shipping as a linkable artifact for sales +
          onboarding. Tighten language as needed for production brand voice.
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  bullets,
  kicker,
  kickerText,
}: {
  title: string;
  bullets: string[];
  kicker: string;
  kickerText: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2 text-sm text-white/75">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-white/60 shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="text-xs uppercase tracking-wide text-white/50 font-semibold">
          {kicker}
        </div>
        <div className="mt-2 text-sm text-white/70">{kickerText}</div>
      </div>
    </div>
  );
}



