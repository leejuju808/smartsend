"use client";
import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Search, Filter, Star, Download, Calendar, Tag } from "lucide-react";

export default function MarketplacePage() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"installs" | "rating" | "new" | "name">("installs");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();

  // Common categories for templates
  const categories = [
    "SaaS", "B2B", "E-commerce", "Real Estate", "Healthcare", 
    "Finance", "Education", "Technology", "Marketing", "Sales"
  ];

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.auth.getUser();
      if (data.user) {
        setUser(data.user);
        // Get user's org
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('org_id')
          .eq('id', data.user.id)
          .single();
        if (profile?.org_id) {
          setOrg({ id: profile.org_id });
        }
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ 
        ...(q && { q }), 
        ...(tag && { tag }),
        ...(category && { category }),
        sort
      }).toString();
      const r = await fetch(`/api/marketplace/templates?${qs}`);
      const data = await r.json();
      setItems(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sort, category]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q || tag) {
        load();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, tag]);

  const install = async (id: string) => {
    if (!user || !org) {
      alert("Please sign in to install templates");
      return;
    }

    try {
      const r = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: id, org_id: org.id, user_id: user.id })
      });
      const j = await r.json();
      
      if (j.ok) {
        alert("Installed! Check your Sequences/Campaigns.");
        // Refresh the list to update install counts
        load();
      } else {
        alert(`Failed: ${j.error}`);
      }
    } catch (error) {
      console.error('Install failed:', error);
      alert('Install failed. Please try again.');
    }
  };

  const clearFilters = () => {
    setQ("");
    setTag("");
    setCategory("");
    setSort("installs");
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h3 className="text-xl font-semibold">Marketplace</h3>
        <p className="mt-2 text-sm text-neutral-600">
          You must be signed in to browse the marketplace.
        </p>
        <a className="mt-4 inline-block rounded-lg border px-3 py-2" href="/signup">
          Sign up / Sign in
        </a>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Template Marketplace</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            value={q} 
            onChange={e => setQ(e.target.value)} 
            placeholder="Search templates by name, description, or tags..." 
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tag</label>
                <input 
                  value={tag} 
                  onChange={e => setTag(e.target.value)} 
                  placeholder="e.g. SaaS, B2B" 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="installs">Most Installed</option>
                  <option value="rating">Top Rated</option>
                  <option value="new">Newest</option>
                  <option value="name">Alphabetical</option>
                </select>
              </div>
            </div>
            
            {(q || tag || category) && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Active filters:</span>
                {q && <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Search: {q}</span>}
                {tag && <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Tag: {tag}</span>}
                {category && <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Category: {category}</span>}
                <button
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {loading ? 'Loading...' : `${items.length} template${items.length !== 1 ? 's' : ''} found`}
          </p>
          {!loading && items.length > 0 && (
            <button 
              onClick={load} 
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              {/* Template Type Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                  {t.kind}
                </span>
                {t.is_paid && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ${(t.price_cents/100).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Template Title & Description */}
              <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">{t.name}</h3>
              <p className="text-sm text-gray-600 mb-4 line-clamp-3">{t.description}</p>

              {/* Tags */}
              {t.tags && t.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {t.tags.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
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
              <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
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

              {/* Install Button */}
              <button 
                onClick={() => install(t.id)} 
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {t.is_paid ? `Buy & Install $${(t.price_cents/100).toFixed(2)}` : "Install Template"}
              </button>
            </div>
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
              Try adjusting your search terms or filters to find what you're looking for.
            </p>
            <button
              onClick={clearFilters}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </main>
  );
} 