"use client";
import { useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Brain, TrendingUp, RefreshCw, Lightbulb, BarChart3 } from "lucide-react";

interface InsightsData {
  insights: string;
  stats: {
    current: Record<string, number>;
    previous: Record<string, number>;
    changes: Record<string, string>;
  };
}

export default function InsightsPage() {
  const [user, setUser] = useState<any>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, [supabase.auth]);

  const loadInsights = useCallback(async () => {
    if (!user?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/reports/insights?userId=${user.id}`);
      const data = await response.json();
      
      if (response.ok) {
        setInsights(data);
      } else {
        setError(data.error || "Failed to load insights");
      }
    } catch (err) {
      setError("Network error while loading insights");
      console.error("Error loading insights:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadInsights();
    }
  }, [user?.id, loadInsights]);

  const formatPercentage = (value: string) => {
    const num = parseFloat(value);
    if (num > 0) return `+${value}%`;
    if (num < 0) return `${value}%`;
    return "0%";
  };

  const getChangeColor = (value: string) => {
    const num = parseFloat(value);
    if (num > 0) return "text-green-600";
    if (num < 0) return "text-red-600";
    return "text-gray-600";
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="text-center py-12">
          <p className="text-gray-600">Please log in to view insights.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-100 to-blue-100 rounded-xl">
            <Brain className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
            <p className="text-sm text-gray-600">AI-powered performance analysis & recommendations</p>
          </div>
        </div>
        <button
          onClick={loadInsights}
          disabled={loading}
          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? "Generating..." : "Refresh Insights"}
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <a
            href="/dashboard/reports"
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
          >
            Analytics
          </a>
          <a
            href="/dashboard/reports/insights"
            className="border-b-2 border-black py-2 px-1 text-sm font-medium text-gray-900"
          >
            AI Insights
          </a>
        </nav>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-gray-50 border rounded-lg p-8 text-center">
          <div className="animate-pulse space-y-4">
            <Brain className="h-12 w-12 text-gray-400 mx-auto" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
            </div>
            <p className="text-gray-600">AI is analyzing your data...</p>
          </div>
        </div>
      )}

      {/* Insights Content */}
      {insights && !loading && (
        <div className="space-y-6">
          {/* AI Generated Insights */}
          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              <h2 className="text-lg font-semibold text-gray-900">AI Analysis & Recommendations</h2>
            </div>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {insights.insights}
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">Performance Overview</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(insights.stats.current).map(([key, value]) => {
                const change = insights.stats.changes[key];
                const prevValue = insights.stats.previous[key] || 0;
                
                return (
                  <div key={key} className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-sm text-gray-600 capitalize">{key}</p>
                    {change && prevValue > 0 && (
                      <div className={`text-xs font-medium mt-1 ${getChangeColor(change)}`}>
                        {formatPercentage(change)} vs last week
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Week-over-Week Changes */}
          {Object.keys(insights.stats.changes).length > 0 && (
            <div className="bg-white border rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-900">Week-over-Week Changes</h2>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(insights.stats.changes).map(([key, value]) => (
                  <div key={key} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`text-lg font-bold ${getChangeColor(value)}`}>
                      {formatPercentage(value)}
                    </div>
                    <p className="text-xs text-gray-600 capitalize">{key}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!insights && !loading && !error && (
        <div className="bg-gray-50 border rounded-lg p-8 text-center">
          <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Insights Yet</h3>
          <p className="text-gray-600 mb-4">
            Start sending emails to generate AI-powered insights and recommendations.
          </p>
          <button
            onClick={loadInsights}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            Generate Insights
          </button>
        </div>
      )}
    </main>
  );
} 