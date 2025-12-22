"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@/lib/supabase';
import { 
  ArrowLeft, 
  Trophy, 
  BarChart3, 
  TrendingUp,
  Users,
  Eye,
  MousePointer,
  MessageSquare,
  CheckCircle,
  AlertCircle
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
}

interface ABVariant {
  id: string;
  ab_test_id: string;
  subject: string;
  body_text: string;
  body_html: string;
  traffic_split: number;
  created_at: string;
}

interface VariantResult {
  variant: ABVariant;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
}

export default function ABTestResultsPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;
  const [test, setTest] = useState<ABTest | null>(null);
  const [results, setResults] = useState<VariantResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [declaringWinner, setDeclaringWinner] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (testId) {
      fetchResults();
    }
  }, [testId]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/abtest/${testId}/results`);
      if (!response.ok) {
        throw new Error('Failed to fetch results');
      }
      
      const data = await response.json();
      setTest(data.test);
      setResults(data.results);
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclareWinner = async (variantId: string) => {
    try {
      setDeclaringWinner(true);
      
      // Update the A/B test to mark winner and complete
      const { error: updateError } = await supabase
        .from('ab_tests')
        .update({ 
          winner_variant_id: variantId,
          status: 'completed'
        })
        .eq('id', testId);

      if (updateError) throw updateError;

      // Refresh results
      await fetchResults();
    } catch (error) {
      console.error('Error declaring winner:', error);
      alert('Failed to declare winner');
    } finally {
      setDeclaringWinner(false);
    }
  };

  const getBestPerformer = () => {
    if (results.length === 0) return null;
    
    // Sort by reply rate (primary), then open rate (secondary)
    return results.sort((a, b) => {
      if (a.reply_rate !== b.reply_rate) {
        return b.reply_rate - a.reply_rate;
      }
      return b.open_rate - a.open_rate;
    })[0];
  };

  const getStatisticalSignificance = (variant1: VariantResult, variant2: VariantResult) => {
    // Simple statistical significance calculation
    // In production, you'd want a more sophisticated test like chi-square
    const n1 = variant1.sent;
    const n2 = variant2.sent;
    const p1 = variant1.reply_rate / 100;
    const p2 = variant2.reply_rate / 100;
    
    if (n1 < 30 || n2 < 30) return 'Insufficient data';
    
    const pooledP = (n1 * p1 + n2 * p2) / (n1 + n2);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
    const z = Math.abs(p1 - p2) / se;
    
    if (z > 1.96) return 'Significant (95%)';
    if (z > 1.65) return 'Significant (90%)';
    return 'Not significant';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="text-center py-8">
        <h2 className="text-xl font-semibold text-gray-900">A/B Test not found</h2>
        <p className="text-gray-600 mt-2">The A/B test you're looking for doesn't exist.</p>
      </div>
    );
  }

  const bestPerformer = getBestPerformer();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/abtest"
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{test.name}</h1>
            <p className="text-gray-600 mt-1">
              {test.parent_kind === 'campaign' ? 'Campaign' : 'Sequence'} A/B Test
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            test.status === 'running' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-blue-100 text-blue-800'
          }`}>
            {test.status === 'running' ? 'Running' : 'Completed'}
          </span>
          {test.winner_variant_id && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
              <Trophy className="w-4 h-4 mr-1" />
              Winner Declared
            </span>
          )}
        </div>
      </div>

      {/* Basic Results */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Test Results</h3>
        <div className="text-center text-gray-600">
          <p>Results will be displayed here once the test is running.</p>
          <p className="mt-2">Total variants: {results.length}</p>
        </div>
      </div>
    </div>
  );
} 