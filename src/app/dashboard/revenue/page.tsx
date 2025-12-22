"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle } from "lucide-react";

interface RevenueData {
  id: string;
  org_id: string;
  mrr: number;
  arr: number;
  churn_rate: number;
  last_sync: string;
  created_at: string;
  updated_at: string;
}

interface RevenueInsights {
  insights: string;
  metrics: {
    mrr: number;
    arr: number;
    churn_rate: number;
    last_sync: string;
  };
}

export default function RevenuePage() {
  const [user, setUser] = useState<any>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [insights, setInsights] = useState<RevenueInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        // Get user's org_id from profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', user.id)
          .single();
        
        if (profile?.org_id) {
          setOrgId(profile.org_id);
        }
      }
      setLoading(false);
    };

    getUser();
  }, [supabase]);

  useEffect(() => {
    if (!orgId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch revenue data
        const revenueResponse = await fetch(`/api/org-revenue?org_id=${orgId}`);
        if (!revenueResponse.ok) throw new Error("Failed to fetch revenue data");
        const revenue = await revenueResponse.json();
        setRevenueData(revenue);

        // Fetch AI insights
        const insightsResponse = await fetch(`/api/revenue/insights?org_id=${orgId}`);
        if (insightsResponse.ok) {
          const insightsData = await insightsResponse.json();
          setInsights(insightsData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orgId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl p-6 space-y-6">
        <div className="h-8 w-48 bg-gray-200 animate-pulse rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 animate-pulse rounded"></div>
          ))}
        </div>
        <div className="h-64 bg-gray-200 animate-pulse rounded"></div>
        <div className="h-32 bg-gray-200 animate-pulse rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Revenue Data</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const currentRevenue = revenueData[revenueData.length - 1] || {
    mrr: 0,
    arr: 0,
    churn_rate: 0,
    last_sync: new Date().toISOString()
  };

  const previousRevenue = revenueData[revenueData.length - 2];
  const mrrChange = previousRevenue ? currentRevenue.mrr - previousRevenue.mrr : 0;
  const arrChange = previousRevenue ? currentRevenue.arr - previousRevenue.arr : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Revenue Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Track your subscription metrics and get AI-powered insights
          </p>
        </div>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Last updated: {formatDate(currentRevenue.last_sync)}
        </span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Monthly Recurring Revenue</h3>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </div>
          <div className="pt-2">
            <div className="text-2xl font-bold">{formatCurrency(currentRevenue.mrr)}</div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              {mrrChange !== 0 && (
                <>
                  {mrrChange > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                  )}
                  {mrrChange > 0 ? '+' : ''}{formatCurrency(mrrChange)} from last month
                </>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Annual Recurring Revenue</h3>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </div>
          <div className="pt-2">
            <div className="text-2xl font-bold">{formatCurrency(currentRevenue.arr)}</div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              {arrChange !== 0 && (
                <>
                  {arrChange > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                  )}
                  {arrChange > 0 ? '+' : ''}{formatCurrency(arrChange)} from last month
                </>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="text-sm font-medium">Churn Rate</h3>
            <Users className="h-4 w-4 text-gray-500" />
          </div>
          <div className="pt-2">
            <div className="text-2xl font-bold">{currentRevenue.churn_rate}%</div>
            <p className="text-xs text-gray-500 mt-1">
              {currentRevenue.churn_rate === 0 ? 'No churn detected' : 'Monthly churn rate'}
            </p>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="pb-4">
          <h3 className="text-lg font-semibold">Revenue Trend</h3>
        </div>
        <div>
          {revenueData.length > 1 ? (
            <div className="h-64">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">MRR Over Time</h4>
                  <div className="space-y-2">
                    {revenueData.slice(-6).map((data, index) => (
                      <div key={data.id} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          {formatDate(data.last_sync)}
                        </span>
                        <span className="font-medium">{formatCurrency(data.mrr)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">ARR Over Time</h4>
                  <div className="space-y-2">
                    {revenueData.slice(-6).map((data, index) => (
                      <div key={data.id} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">
                          {formatDate(data.last_sync)}
                        </span>
                        <span className="font-medium">{formatCurrency(data.arr)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <DollarSign className="mx-auto h-12 w-12 mb-2" />
                <p>Revenue data will appear here once you have subscription activity</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="pb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            AI Revenue Insights
          </h3>
        </div>
        <div>
          {insights ? (
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {insights.insights}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>AI insights will be generated based on your revenue data</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
} 