"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { Search, Filter, Star, Download, Rocket, Tag } from "lucide-react";

export default function AgentCloudPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"downloads" | "rating" | "new">("downloads");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  const categories = ["outreach", "follow-up", "reactivation"];

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

  const loadAgents = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ 
        ...(category && { category }),
        sort
      }).toString();
      const r = await fetch(`/api/marketplace/agents/list?${qs}`);
      const data = await r.json();
      setAgents(data);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, [sort, category]);

  const deployAgent = async (id: string) => {
    if (!user || !org) {
      alert("Please sign in to deploy agents");
      return;
    }

    try {
      const r = await fetch("/api/marketplace/agents/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          agent_id: id, 
          org_id: org.id, 
          user_id: user.id 
        })
      });
      const data = await r.json();
      
      if (data.success) {
        alert(data.message || "Agent deployed to your SmartSend account!");
        loadAgents();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Deploy failed:', error);
      alert('Deploy failed. Please try again.');
    }
  };

  const clearFilters = () => {
    setQ("");
    setCategory("");
    loadAgents();
  };

  // Filter by search query client-side
  const filteredAgents = q 
    ? agents.filter(a =>
        a.name.toLowerCase().includes(q.toLowerCase()) ||
        (a.description || "").toLowerCase().includes(q.toLowerCase())
      )
    : agents;

  return (
    <div className="p-6">
      <header className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AgentCloud Marketplace</h1>
            <p className="text-gray-600 mt-2">
              Browse, buy, and deploy AI outreach agents & templates from the community
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <Filter className="mr-2 h-4 w-4" />
          {showFilters ? 'Hide' : 'Show'} Filters
        </button>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="downloads">Most Downloaded</option>
                  <option value="rating">Top Rated</option>
                  <option value="new">Newest</option>
                </select>
              </div>
            </div>
            
            {(q || category) && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Active filters:</span>
                {q && <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Search: {q}</span>}
                {category && <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded capitalize">Category: {category}</span>}
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
            {loading ? 'Loading...' : `${filteredAgents.length} agent${filteredAgents.length !== 1 ? 's' : ''} found`}
          </p>
          {!loading && filteredAgents.length > 0 && (
            <button 
              onClick={loadAgents} 
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => (
            <div 
              key={agent.id} 
              className="bg-black/60 text-white rounded-xl p-6 hover:shadow-lg transition-shadow border border-gray-800"
            >
              {/* Category Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100/20 text-blue-300 capitalize">
                  {agent.category}
                </span>
                {agent.price > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100/20 text-green-300">
                    ${agent.price.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Agent Title & Description */}
              <h3 className="text-lg font-semibold mb-2 line-clamp-2">{agent.name}</h3>
              <p className="text-sm text-gray-400 mb-4 line-clamp-3">{agent.description}</p>

              {/* Creator Info */}
              {agent.creator && (
                <p className="text-xs text-gray-500 mb-4">
                  By {agent.creator.full_name || agent.creator.email}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {agent.downloads || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {agent.rating ? agent.rating.toFixed(1) : "0.0"}
                </span>
              </div>

              {/* Deploy Button */}
              <button
                onClick={() => deployAgent(agent.id)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Rocket className="h-4 w-4" />
                Deploy Agent
              </button>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {!loading && filteredAgents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No agents found</p>
            <p className="text-gray-400 text-sm mt-2">
              Try adjusting your filters or check back later
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading agents...</p>
          </div>
        )}
      </div>
    </div>
  );
}

