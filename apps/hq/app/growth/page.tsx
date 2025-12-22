"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface GrowthMetrics {
  orgs: number;
  signups: number;
  arr: number;
  subscriptions: number;
  referrals_converted: number;
  cac_payback: number;
  last_updated: string;
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-800 p-6 rounded-2xl bg-black/60 hover:border-amber-400 transition-colors">
      <p className="text-gray-400 text-sm mb-2">{label}</p>
      <h2 className="text-3xl font-bold text-white">{value}</h2>
    </div>
  );
}

export default function Growth() {
  const { data, error, isLoading } = useSWR<GrowthMetrics>("/api/growth-metrics", fetcher, {
    refreshInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading growth metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Error loading metrics</p>
      </div>
    );
  }

  const metrics = data || {
    orgs: 0,
    signups: 0,
    arr: 0,
    subscriptions: 0,
    referrals_converted: 0,
    cac_payback: 0,
    last_updated: new Date().toISOString()
  };

  // Format ARR with proper decimal places
  const arrFormatted = metrics.arr >= 1000 
    ? `$${(metrics.arr / 1000).toFixed(1)}M` 
    : `$${metrics.arr.toFixed(0)}`;

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Growth Dashboard</h1>
        <p className="text-gray-400">
          Real-time ARR trajectory and acquisition metrics
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Tile label="Active Orgs" value={metrics.orgs.toLocaleString()} />
        <Tile label="Monthly Signups" value={metrics.signups.toLocaleString()} />
        <Tile label="ARR" value={arrFormatted} />
      </div>

      {/* Secondary Metrics */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Tile label="Active Subscriptions" value={metrics.subscriptions.toLocaleString()} />
        <Tile label="Referrals Converted" value={metrics.referrals_converted.toLocaleString()} />
        <Tile label="CAC Payback" value={`${metrics.cac_payback.toFixed(1)} mo`} />
      </div>

      {/* Target Progress */}
      <div className="mt-8 p-6 bg-surface border border-gray-800 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Q3 2026 Targets</h3>
        <div className="space-y-4">
          {/* Active Orgs Target */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Active Orgs</span>
              <span className="text-sm text-white">{metrics.orgs} / 500+</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-amber-400 h-2 rounded-full transition-all"
                style={{ width: `${Math.min((metrics.orgs / 500) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* ARR Target */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">ARR</span>
              <span className="text-sm text-white">${(metrics.arr / 1000000).toFixed(1)}M / $3M</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-green-400 h-2 rounded-full transition-all"
                style={{ width: `${Math.min((metrics.arr / 3000000) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* CAC Payback Target */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">CAC Payback</span>
              <span className="text-sm text-white">{metrics.cac_payback.toFixed(1)} mo / 1.5 mo</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-blue-400 h-2 rounded-full transition-all"
                style={{ width: `${Math.max(Math.min((1.5 / metrics.cac_payback) * 100, 100), 0)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Growth Engines Status */}
      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <div className="p-6 bg-surface border border-gray-800 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Growth Engines</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              <span className="text-gray-300">Inbound Funnels (SEO + Content)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              <span className="text-gray-300">Automated Sales Loops (SmartSend)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              <span className="text-gray-300">Usage Expansion (AI Upsells)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              <span className="text-gray-300">Growth Agents (AgentCloud)</span>
            </div>
          </div>
        </div>

        <div className="p-6 bg-surface border border-gray-800 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Attribution Channels</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Organic</span>
              <span className="text-amber-400 font-semibold">Primary</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Referrals</span>
              <span className="text-green-400 font-semibold">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Partners</span>
              <span className="text-yellow-400 font-semibold">Growing</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Ads</span>
              <span className="text-gray-500 font-semibold">Testing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      <div className="mt-6 text-xs text-gray-500 text-right">
        Last updated: {new Date(metrics.last_updated).toLocaleString()}
      </div>
    </div>
  );
}
