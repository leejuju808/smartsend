"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RiskBadge } from "./RiskBadge";
import { HomeownerExperienceBadge } from "./HomeownerExperienceMeter";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  heat_score: number | null;
  job_probability: number | null;
  estimated_job_value: number | null;
  estimator_id: string | null;
  estimator_name: string | null;
  homeowner_tone: string | null;
  homeowner_experience_score: number | null;
  experience_trend: "improving" | "declining" | "stable" | null;
  risk_score: number | null;
  risk_category: "low" | "medium" | "high" | "critical" | null;
  created_at: string;
  updated_at: string;
  last_activity: string;
}

interface LeadCardProps {
  lead: Lead;
}

export function LeadCard({ lead }: LeadCardProps) {
  const formatCurrency = (value: number | null) => {
    if (!value) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getHeatColor = (score: number | null) => {
    if (!score) return 'text-gray-400';
    if (score >= 80) return 'text-red-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-gray-400';
  };

  const getToneBadge = (tone: string | null) => {
    if (!tone) return null;
    const toneMap: Record<string, { emoji: string; color: string }> = {
      'positive': { emoji: '😊', color: 'bg-green-500/20 text-green-700' },
      'angry': { emoji: '😠', color: 'bg-red-500/20 text-red-700' },
      'confused': { emoji: '😕', color: 'bg-yellow-500/20 text-yellow-700' },
      'price-shopping': { emoji: '💰', color: 'bg-blue-500/20 text-blue-700' },
      'scheduling-focused': { emoji: '📅', color: 'bg-purple-500/20 text-purple-700' },
      'appreciation': { emoji: '🙏', color: 'bg-green-500/20 text-green-700' },
    };
    const toneInfo = toneMap[tone.toLowerCase()] || { emoji: '💬', color: 'bg-gray-500/20 text-gray-700' };
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded ${toneInfo.color}`}>
        {toneInfo.emoji} {tone}
      </span>
    );
  };

  return (
    <Card className="p-3 rounded-xl bg-black/30 border border-white/10 shadow-sm cursor-pointer hover:bg-black/40 transition-all duration-200 hover:shadow-md">
      <CardContent className="p-0">
        {/* Name and City */}
        <div className="flex justify-between items-start mb-2">
          <div className="font-semibold text-sm text-white truncate flex-1">
            {lead.name || 'Unknown'}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lead.city && (
              <span className="text-xs text-gray-400">
                {lead.city}
              </span>
            )}
            {lead.risk_score !== null && lead.risk_score > 0 && lead.risk_category && (
              <RiskBadge
                category={lead.risk_category}
                score={lead.risk_score}
                showLabel={lead.risk_category === "critical" || lead.risk_category === "high"}
              />
            )}
          </div>
        </div>

        {/* Heat Score, Job Probability, and Homeowner Experience */}
        <div className="flex items-center gap-3 mb-2 text-xs flex-wrap">
          {lead.heat_score !== null && (
            <span className={`font-medium ${getHeatColor(lead.heat_score)}`}>
              🔥 {lead.heat_score}
            </span>
          )}
          {lead.job_probability !== null && (
            <span className="text-gray-300">
              📈 {lead.job_probability}%
            </span>
          )}
          {lead.homeowner_experience_score !== null && (
            <HomeownerExperienceBadge
              score={lead.homeowner_experience_score}
              trend={lead.experience_trend}
            />
          )}
        </div>

        {/* Homeowner Tone */}
        {lead.homeowner_tone && (
          <div className="mb-2">
            {getToneBadge(lead.homeowner_tone)}
          </div>
        )}

        {/* Job Value */}
        {lead.estimated_job_value && lead.estimated_job_value > 0 && (
          <div className="text-xs font-semibold text-green-400 mb-2">
            {formatCurrency(lead.estimated_job_value)}
          </div>
        )}

        {/* Estimator */}
        {lead.estimator_name && (
          <div className="text-xs text-gray-400 mb-1">
            👤 {lead.estimator_name}
          </div>
        )}

        {/* Last Activity */}
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-white/5">
          {formatDate(lead.last_activity || lead.updated_at)}
        </div>
      </CardContent>
    </Card>
  );
}

