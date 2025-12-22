"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import StarRater from "@/components/marketplace/StarRater";

export default function TemplateDetailPage() {
  const params = useParams();
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.auth.getUser();
      if (data.user) {
        setUser(data.user);
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

  useEffect(() => {
    if (params?.id) {
      loadTemplate();
    }
  }, [params?.id]);

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/marketplace/templates/${params.id}`);
      if (r.ok) {
        const data = await r.json();
        setTemplate(data);
      }
    } catch (error) {
      console.error('Failed to load template:', error);
    } finally {
      setLoading(false);
    }
  };

  const install = async () => {
    if (!user || !org) {
      alert("Please sign in to install templates");
      return;
    }

    try {
      const r = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: params.id, org_id: org.id, user_id: user.id })
      });
      const j = await r.json();
      
      if (j.ok) {
        alert("Installed! Check your Sequences/Campaigns.");
        loadTemplate(); // Refresh to update install count
      } else {
        alert(`Failed: ${j.error}`);
      }
    } catch (error) {
      console.error('Install failed:', error);
      alert('Install failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded mb-6"></div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-red-600">Template not found</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-gray-500 uppercase mb-2">{template.kind}</div>
          <h1 className="text-3xl font-bold mb-2">{template.name}</h1>
          <p className="text-gray-600 text-lg">{template.description}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">
            {template.is_paid ? `$${(template.price_cents/100).toFixed(2)}` : "Free"}
          </div>
          <div className="text-sm text-gray-500">
            ⭐ {Number(template.mv_template_stats?.avg_stars || template.rating || 0).toFixed(1)} 
            ({template.mv_template_stats?.ratings_count || 0} ratings)
          </div>
          <div className="text-sm text-gray-500">
            ⬇ {template.mv_template_stats?.installs || template.installs || 0} installs
          </div>
        </div>
      </div>

      {template.tags && template.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {template.tags.map((tag: string) => (
            <span key={tag} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Template Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium mb-2">Type</h3>
            <p className="text-gray-600 capitalize">{template.kind}</p>
          </div>
          <div>
            <h3 className="font-medium mb-2">Created</h3>
            <p className="text-gray-600">
              {new Date(template.created_at).toLocaleDateString()}
            </p>
          </div>
          {template.author && (
            <div>
              <h3 className="font-medium mb-2">Author</h3>
              <p className="text-gray-600">{template.author}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={install}
          className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
        >
          {template.is_paid ? `Buy & Install ($${(template.price_cents/100).toFixed(2)})` : "Install Template"}
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to Marketplace
        </button>
      </div>

      <div className="border-t pt-8">
        <StarRater templateId={params.id as string} />
      </div>
    </div>
  );
} 