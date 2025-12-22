"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@/lib/supabase';
import { isSalesModeEnabled } from '@/lib/feature-flags';
import { 
  Plus, 
  BarChart3, 
  Mail, 
  MessageSquare, 
  TrendingUp,
  Users,
  Calendar,
  Target
} from 'lucide-react';
import Link from 'next/link';

interface ABTest {
  id: string;
  parent_kind: 'campaign' | 'sequence';
  parent_id: string;
  name: string;
  status: 'running' | 'completed';
  winner_variant_id: string | null;
  created_at: string;
  parent_name: string;
  variants: ABVariant[];
  metrics: {
    total_sent: number;
    total_opens: number;
    total_clicks: number;
    total_replies: number;
  };
}

interface ABVariant {
  id: string;
  ab_test_id: string;
  subject: string;
  body_text: string;
  body_html: string;
  traffic_split: number;
  created_at: string;
  metrics: {
    sent: number;
    opens: number;
    clicks: number;
    replies: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
  };
}

export default function ABTestingDashboard() {
  const router = useRouter();
  if (isSalesModeEnabled()) return null;
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    // BLOCK 281000 — Sales Mode: hide non-v1 surface area.
    if (isSalesModeEnabled()) {
      router.replace('/dashboard');
      return;
    }
    fetchABTests();
  }, []);

  const fetchABTests = async () => {
    try {
      setLoading(true);
      
      // Fetch A/B tests with variants and metrics
      const { data: testsData, error } = await supabase
        .from('ab_tests')
        .select(`
          *,
          ab_variants (
            *,
            metrics:variant_metrics (
              impressions,
              opens,
              clicks,
              replies
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process the data to calculate metrics
      const processedTests = await Promise.all(
        (testsData || []).map(async (test) => {
          // Get parent name
          let parentName = 'Unknown';
          if (test.parent_kind === 'campaign') {
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('name')
              .eq('id', test.parent_id)
              .single();
            parentName = campaign?.name || 'Unknown Campaign';
          } else if (test.parent_kind === 'sequence') {
            const { data: sequence } = await supabase
              .from('sequences')
              .select('name')
              .eq('id', test.parent_id)
              .single();
            parentName = sequence?.name || 'Unknown Sequence';
          }

          // Calculate metrics
          const variants = test.ab_variants || [];
          const totalMetrics = variants.reduce((acc: any, variant: any) => {
            const metrics = variant.metrics?.[0] || { impressions: 0, opens: 0, clicks: 0, replies: 0 };
            acc.sent += metrics.impressions || 0;
            acc.opens += metrics.opens || 0;
            acc.clicks += metrics.clicks || 0;
            acc.replies += metrics.replies || 0;
            return acc;
          }, { sent: 0, opens: 0, clicks: 0, replies: 0 });

          // Add calculated rates to variants
          const processedVariants = variants.map((variant: any) => {
            const metrics = variant.metrics?.[0] || { impressions: 0, opens: 0, clicks: 0, replies: 0 };
            const sent = metrics.impressions || 0;
            return {
              ...variant,
              metrics: {
                sent,
                opens: metrics.opens || 0,
                clicks: metrics.clicks || 0,
                replies: metrics.replies || 0,
                open_rate: sent > 0 ? Math.round((metrics.opens || 0) / sent * 100) : 0,
                click_rate: sent > 0 ? Math.round((metrics.clicks || 0) / sent * 100) : 0,
                reply_rate: sent > 0 ? Math.round((metrics.replies || 0) / sent * 100) : 0,
              }
            };
          });

          return {
            ...test,
            parent_name: parentName,
            variants: processedVariants,
            metrics: totalMetrics
          };
        })
      );

      setTests(processedTests);
    } catch (error) {
      console.error('Error fetching A/B tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getParentIcon = (kind: string) => {
    switch (kind) {
      case 'campaign': return <Mail className="w-4 h-4" />;
      case 'sequence': return <MessageSquare className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">A/B Testing Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor and optimize your email campaigns and sequences with A/B testing
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create A/B Test
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Tests</p>
              <p className="text-2xl font-bold text-gray-900">
                {tests.filter(t => t.status === 'running').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Sent</p>
              <p className="text-2xl font-bold text-gray-900">
                {tests.reduce((sum, test) => sum + test.metrics.total_sent, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg Open Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {tests.length > 0 
                  ? Math.round(tests.reduce((sum, test) => {
                      const avgRate = test.variants.reduce((vSum, v) => vSum + v.metrics.open_rate, 0) / test.variants.length;
                      return sum + avgRate;
                    }, 0) / tests.length)
                  : 0}%
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Target className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Completed Tests</p>
              <p className="text-2xl font-bold text-gray-900">
                {tests.filter(t => t.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* A/B Tests List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Active A/B Tests</h3>
          <p className="text-sm text-gray-600 mt-1">
            Monitor performance and declare winners for your email variants
          </p>
        </div>

        {tests.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No A/B tests yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first A/B test for a campaign or sequence.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create A/B Test
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {tests.map((test) => (
              <div key={test.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="flex items-center space-x-2">
                        {getParentIcon(test.parent_kind)}
                        <span className="text-sm text-gray-500 capitalize">{test.parent_kind}</span>
                      </div>
                      <h4 className="text-lg font-medium text-gray-900">{test.name}</h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(test.status)}`}>
                        {test.status}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 mb-4">
                      Testing: <span className="font-medium">{test.parent_name}</span>
                      <span className="mx-2">•</span>
                      Created: <span className="font-medium">{new Date(test.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Variants Performance */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {test.variants.map((variant) => (
                        <div key={variant.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium text-gray-900">{variant.subject?.slice(0, 40) || 'Variant'}</h5>
                            <span className="text-xs text-gray-500">{variant.traffic_split}% traffic</span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <div className="text-lg font-bold text-gray-900">{variant.metrics.sent}</div>
                              <div className="text-xs text-gray-500">Sent</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-blue-600">{variant.metrics.open_rate}%</div>
                              <div className="text-xs text-gray-500">Open</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-green-600">{variant.metrics.reply_rate}%</div>
                              <div className="text-xs text-gray-500">Reply</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Overall Metrics */}
                    <div className="mt-4 grid grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">{test.metrics.total_sent}</div>
                        <div className="text-xs text-gray-500">Total Sent</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">
                          {test.metrics.total_sent > 0 ? Math.round(test.metrics.total_opens / test.metrics.total_sent * 100) : 0}%
                        </div>
                        <div className="text-xs text-gray-500">Open Rate</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {test.metrics.total_sent > 0 ? Math.round(test.metrics.total_clicks / test.metrics.total_sent * 100) : 0}%
                        </div>
                        <div className="text-xs text-gray-500">Click Rate</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">
                          {test.metrics.total_sent > 0 ? Math.round(test.metrics.total_replies / test.metrics.total_sent * 100) : 0}%
                        </div>
                        <div className="text-xs text-gray-500">Reply Rate</div>
                      </div>
                    </div>
                  </div>

                  <div className="ml-6 flex space-x-2">
                    <Link
                      href={`/dashboard/abtest/${test.id}`}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <BarChart3 className="w-4 h-4 mr-1" />
                      View Details
                    </Link>
                    {test.parent_kind === 'campaign' && (
                      <Link
                        href={`/dashboard/campaigns/${test.parent_id}/variants`}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        Manage Variants
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create A/B Test Modal would go here */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create A/B Test</h3>
              <p className="text-sm text-gray-600 mb-4">
                This feature is coming soon. For now, you can create A/B tests directly from your campaigns.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 