'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  DollarSign, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  ExternalLink,
  Star,
  Download,
  Calendar,
  RefreshCw,
  Globe
} from 'lucide-react';

interface CreatorProfile {
  id: string;
  display_name: string;
  bio?: string;
  website?: string;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  stripe_account_id?: string;
  created_at: string;
}

interface Balance {
  accrued: number;
  queued: number;
  paid: number;
  total: number;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  rating: number;
  installs: number;
  is_paid: boolean;
  price_cents: number;
  created_at: string;
}

interface Payout {
  id: string;
  amount_cents: number;
  status: 'accrued' | 'queued' | 'paid' | 'failed';
  created_at: string;
  template: { name: string };
}

export default function CreatorDashboardPage() {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recentPayouts, setRecentPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingOnboarding, setRefreshingOnboarding] = useState(false);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchCreatorData();
  }, []);

  const fetchCreatorData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/creators/me');
      
      if (!response.ok) {
        if (response.status === 404) {
          // Redirect to apply page if no creator profile
          window.location.href = '/creators/apply';
          return;
        }
        throw new Error('Failed to fetch creator data');
      }

      const data = await response.json();
      setProfile(data.creator);
      setBalance(data.balance);
      setTemplates(data.templates);
      setRecentPayouts(data.recentPayouts);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const refreshOnboardingLink = async () => {
    if (!profile) return;
    
    setRefreshingOnboarding(true);
    try {
      const response = await fetch('/api/creators/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: profile.id }),
      });

      if (response.ok) {
        const data = await response.json();
        window.open(data.onboardingUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to refresh onboarding link:', err);
    } finally {
      setRefreshingOnboarding(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', text: 'Pending Review' },
      approved: { color: 'bg-green-100 text-green-800', text: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', text: 'Rejected' },
      disabled: { color: 'bg-gray-100 text-gray-800', text: 'Disabled' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading creator dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600" />
          <p className="mt-4 text-gray-600">{error}</p>
          <button
            onClick={fetchCreatorData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{profile.display_name}</h1>
              <p className="text-gray-600 mt-1">{profile.bio}</p>
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-flex items-center"
                >
                  <Globe className="w-4 h-4 mr-1" />
                  {profile.website}
                </a>
              )}
            </div>
            <div className="text-right">
              {getStatusBadge(profile.status)}
              <p className="text-sm text-gray-500 mt-1">
                Member since {formatDate(profile.created_at)}
              </p>
            </div>
          </div>

          {profile.status === 'pending' && profile.stripe_account_id && (
            <div className="mt-4 p-4 bg-blue-50 rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-800">
                    Complete your Stripe onboarding to start receiving payments
                  </p>
                </div>
                <button
                  onClick={refreshOnboardingLink}
                  disabled={refreshingOnboarding}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {refreshingOnboarding ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  Complete Onboarding
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Balance Cards */}
        {balance && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Total Earned</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(balance.total)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-8 w-8 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Accrued</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(balance.accrued)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <RefreshCw className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Queued</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(balance.queued)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Paid Out</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatCurrency(balance.paid)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Templates */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Your Templates</h2>
            </div>
            <div className="p-6">
              {templates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No templates yet</p>
                  <p className="text-sm text-gray-400 mt-1">Create your first template to start earning</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((template) => (
                    <div key={template.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{template.name}</h3>
                          {template.description && (
                            <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                          )}
                          <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
                            <div className="flex items-center">
                              <Star className="w-4 h-4 text-yellow-400 mr-1" />
                              {template.rating.toFixed(1)}
                            </div>
                            <div className="flex items-center">
                              <Download className="w-4 h-4 mr-1" />
                              {template.installs}
                            </div>
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-1" />
                              {formatDate(template.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {template.is_paid ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ${(template.price_cents / 100).toFixed(2)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Free
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Payouts */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Recent Payouts</h2>
            </div>
            <div className="p-6">
              {recentPayouts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No payouts yet</p>
                  <p className="text-sm text-gray-400 mt-1">Payouts appear here after template sales</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentPayouts.map((payout) => (
                    <div key={payout.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{payout.template.name}</p>
                        <p className="text-xs text-gray-500">{formatDate(payout.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{formatCurrency(payout.amount_cents)}</p>
                        {getStatusBadge(payout.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 