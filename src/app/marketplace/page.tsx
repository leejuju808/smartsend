"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Filter, Star, Download, Calendar, Tag, TrendingUp } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  kind: string;
  tags: string[];
  is_paid: boolean;
  price_cents: number;
  cover_url?: string;
  author?: string;
  rating: number;
  installs: number;
  created_at: string;
  mv_template_stats?: {
    installs: number;
    avg_stars: number;
    ratings_count: number;
  };
}

interface TrendingTemplate {
  template_id: string;
  name: string;
  cover_url?: string;
  is_paid: boolean;
  price_cents: number;
  kind: string;
  views_7d: number;
  installs_7d: number;
  copies_7d: number;
  exports_7d: number;
  trend_score: number;
}

export default function MarketplacePage() {
  const [items, setItems] = useState<Template[]>([]);
  const [trending, setTrending] = useState<TrendingTemplate[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "installs" | "rating" | "trending">("new");
  const [loading, setLoading] = useState(true);
  const [trendingLoading, setTrendingLoading] = useState(true);

  // Load trending templates
  useEffect(() => {
    async function loadTrending() {
      setTrendingLoading(true);
      try {
        const res = await fetch('/api/marketplace/trending?limit=12');
        const data = await res.json();
        setTrending(data.items || []);
      } catch (error) {
        console.error('Failed to load trending:', error);
      } finally {
        setTrendingLoading(false);
      }
    }
    loadTrending();
  }, []);

  // Load main templates
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (sort) params.set('sort', sort);
        
        const res = await fetch(`/api/templates?${params.toString()}`);
        const data = await res.json();
        setItems(data.data?.items || []);
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [q, sort]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q) {
        // Trigger search
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const logEvent = async (templateId: string, eventType: string) => {
    try {
      await fetch('/api/templates/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, event_type: eventType })
      });
    } catch (error) {
      console.error('Failed to log event:', error);
    }
  };

  const handleTemplateClick = (templateId: string) => {
    logEvent(templateId, 'view');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Email Template Marketplace
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Discover and save professional email templates to kickstart your campaigns. 
            Find templates for introductions, follow-ups, sales outreach, and more.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                value={q} 
                onChange={e => setQ(e.target.value)} 
                placeholder="Search templates..." 
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
              />
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as any)}
              className="rounded-xl border border-gray-300 p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="new">Newest</option>
              <option value="installs">Most Installed</option>
              <option value="rating">Top Rated</option>
              <option value="trending">Trending</option>
            </select>
            <Link 
              href="/templates/new" 
              className="rounded-xl border border-gray-300 px-4 py-3 hover:bg-gray-50 text-center"
            >
              Upload Template
            </Link>
          </div>
        </div>

        {/* Trending Section */}
        {trending.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-orange-500" />
              <h2 className="text-xl font-semibold">🔥 Trending This Week</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {trending.map((t, i) => (
                <Link 
                  key={t.template_id} 
                  href={`/templates/${t.template_id}`}
                  onClick={() => handleTemplateClick(t.template_id)}
                  className="min-w-[220px] rounded-2xl border border-gray-200 p-4 hover:shadow-lg transition-shadow bg-white"
                >
                  {t.cover_url ? (
                    <img 
                      src={t.cover_url} 
                      alt={t.name} 
                      className="h-28 w-full rounded-xl object-cover mb-3" 
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-xl bg-gray-100 mb-3">
                      <span className="text-gray-400">No Cover</span>
                    </div>
                  )}
                  <div className="text-sm font-semibold line-clamp-1 mb-1">
                    #{i + 1} · {t.name}
                  </div>
                  <div className="text-xs text-gray-600">
                    ⬇️ {t.installs_7d || 0} installs · 📋 {t.copies_7d || 0} copies
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Main Template Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {loading ? 'Loading...' : `${items.length} template${items.length !== 1 ? 's' : ''} found`}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((t) => (
              <Link 
                key={t.id} 
                href={`/templates/${t.id}`}
                onClick={() => handleTemplateClick(t.id)}
                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                {t.cover_url ? (
                  <img 
                    src={t.cover_url} 
                    alt={t.name} 
                    className="h-40 w-full rounded-xl object-cover mb-4" 
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-xl bg-gray-100 mb-4">
                    <span className="text-gray-400">No Cover</span>
                  </div>
                )}
                
                <div className="text-lg font-semibold mb-2 line-clamp-2">{t.name}</div>
                <div className="text-sm text-gray-600 mb-4 line-clamp-2">{t.description}</div>
                
                {/* Tags */}
                {t.tags && t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {t.tags.slice(0, 3).map((tag) => (
                      <span 
                        key={tag} 
                        className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700"
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                      </span>
                    ))}
                    {t.tags.length > 3 && (
                      <span className="text-xs text-gray-500">+{t.tags.length - 3} more</span>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span>{Number(t.mv_template_stats?.avg_stars || t.rating || 0).toFixed(1)}</span>
                      <span className="text-gray-400">({t.mv_template_stats?.ratings_count || 0})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="w-4 h-4" />
                      <span>{t.mv_template_stats?.installs || t.installs || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Price */}
                <div className="text-right">
                  <span className="text-lg font-bold text-gray-900">
                    {t.is_paid ? `$${(t.price_cents / 100).toFixed(2)}` : 'Free'}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Empty State */}
          {items.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Search className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
              <p className="text-gray-600 mb-4">
                Try adjusting your search terms to find what you're looking for.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}