'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@/lib/supabase';
import StarRater from './StarRater';
import RatingsDisplay from './RatingsDisplay';

interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  kind: 'sequence' | 'campaign';
  tags: string[];
  is_paid: boolean;
  price_cents: number;
  cover_url?: string;
  payload: any;
  author?: string;
  rating: number;
  installs: number;
  created_at: string;
}

interface MarketplaceTemplateDetailProps {
  template: MarketplaceTemplate;
}

export function MarketplaceTemplateDetail({ template }: MarketplaceTemplateDetailProps) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const router = useRouter();
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        
        // Check if user has access to this template
        if (template.is_paid) {
          const { data: entitlement } = await supabase
            .from('marketplace_entitlements')
            .select('id')
            .eq('user_id', user.id)
            .eq('template_id', template.id)
            .maybeSingle();
          
          setHasAccess(!!entitlement);
        } else {
          setHasAccess(true);
        }

        // Log view event
        try {
          await fetch('/api/templates/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              template_id: template.id,
              event_type: 'view'
            })
          });
        } catch (error) {
          console.error('Failed to log view event:', error);
        }
      }
    }
    
    checkAccess();
  }, [template.id, template.is_paid, supabase]);

  const handleInstall = async () => {
    if (!user) {
      router.push('/signup');
      return;
    }

    if (template.is_paid && !hasAccess) {
      // Redirect to pricing for paid templates
      router.push('/pricing');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          template_id: template.id,
          user_id: user.id
        })
      });

      if (response.status === 402) {
        const data = await response.json();
        if (data.redirect) {
          router.push(data.redirect);
          return;
        }
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to install template');
      }

      const result = await response.json();
      alert('Template installed successfully!');
      
      // Log install event
      try {
        await fetch('/api/templates/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: template.id,
            event_type: 'install'
          })
        });
      } catch (error) {
        console.error('Failed to log install event:', error);
      }
      
      // Download the template JSON if available
      if (result.download_url) {
        window.location.href = result.download_url;
      }
    } catch (error) {
      console.error('Install failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to install template');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!user) {
      router.push('/signup');
      return;
    }

    try {
      const response = await fetch('/api/marketplace/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          user_id: user.id
        })
      });

      const data = await response.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Purchase failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to start purchase');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{template.name}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
              <span className="capitalize">{template.kind}</span>
              <span>⭐ {Number(template.rating || 0).toFixed(1)}</span>
              <span>{template.installs || 0} installs</span>
              {template.author && <span>by {template.author}</span>}
            </div>
            <p className="text-lg text-gray-700">{template.description}</p>
          </div>
          
          {/* Price and Actions */}
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 mb-2">
              {template.is_paid ? `$${(template.price_cents / 100).toFixed(2)}` : 'Free'}
            </div>
            <div className="space-y-2">
              {template.is_paid && !hasAccess ? (
                <button
                  onClick={handlePurchase}
                  className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Purchase Template
                </button>
              ) : (
                <button
                  onClick={handleInstall}
                  disabled={loading}
                  className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Installing...' : (template.is_paid ? 'Download Template' : 'Install Template')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mt-4">
          {template.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Cover Image */}
      {template.cover_url && (
        <div>
          <img
            src={template.cover_url}
            alt={template.name}
            className="w-full h-64 object-cover rounded-lg"
          />
        </div>
      )}

      {/* Template Preview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Template Preview</h2>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
              {JSON.stringify(template.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Ratings Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <StarRater templateId={template.id} />
      </div>

      {/* Ratings Display */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <RatingsDisplay templateId={template.id} />
      </div>

      {/* Template Info */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Template Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Type:</span>
            <span className="ml-2 font-medium capitalize">{template.kind}</span>
          </div>
          <div>
            <span className="text-gray-600">Created:</span>
            <span className="ml-2 font-medium">
              {new Date(template.created_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Rating:</span>
            <span className="ml-2 font-medium">⭐ {Number(template.rating || 0).toFixed(1)}</span>
          </div>
          <div>
            <span className="text-gray-600">Downloads:</span>
            <span className="ml-2 font-medium">{template.installs || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
} 