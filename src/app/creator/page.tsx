"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, Download, Eye, Calendar, Edit, Trash2, TrendingUp } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  kind: string;
  tags: string[];
  is_paid: boolean;
  price_cents: number;
  author: string;
  rating: number;
  installs: number;
  created_at: string;
  updated_at: string;
  mv_template_stats?: {
    installs: number;
    avg_stars: number;
    ratings_count: number;
  };
}

export default function CreatorDashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/creator/templates");
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setTemplates(data.templates || []);
      }
    } catch (error) {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const togglePublish = async (id: string, published: boolean) => {
    try {
      const res = await fetch("/api/creator/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, published: !published })
      });
      
      if (res.ok) {
        await loadTemplates();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update template");
      }
    } catch (error) {
      alert("Failed to update template");
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        await loadTemplates();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete template");
      }
    } catch (error) {
      alert("Failed to delete template");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="text-gray-500">Loading your templates...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="text-red-500 mb-4">{error}</div>
            <button 
              onClick={loadTemplates}
              className="text-blue-600 hover:text-blue-800"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Creator Dashboard</h1>
              <p className="text-gray-600 mt-2">Manage your templates and track performance</p>
            </div>
            <Link 
              href="/templates/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create New Template
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Download className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Downloads</p>
                <p className="text-2xl font-bold text-gray-900">
                  {templates.reduce((sum, t) => sum + (t.mv_template_stats?.installs || t.installs || 0), 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Star className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Rating</p>
                <p className="text-2xl font-bold text-gray-900">
                  {templates.length > 0 
                    ? (templates.reduce((sum, t) => sum + (t.mv_template_stats?.avg_stars || t.rating || 0), 0) / templates.length).toFixed(1)
                    : '0.0'
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Templates</p>
                <p className="text-2xl font-bold text-gray-900">{templates.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Eye className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Reviews</p>
                <p className="text-2xl font-bold text-gray-900">
                  {templates.reduce((sum, t) => sum + (t.mv_template_stats?.ratings_count || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Templates Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Your Templates</h2>
          </div>
          
          {templates.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Download className="w-16 h-16 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first template to get started with the marketplace.
              </p>
              <Link 
                href="/templates/new"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Template
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Downloads
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rating
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {template.name}
                          </div>
                          <div className="text-sm text-gray-500 line-clamp-1">
                            {template.description}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {template.kind}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <Download className="w-4 h-4 mr-1 text-gray-400" />
                          {template.mv_template_stats?.installs || template.installs || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <Star className="w-4 h-4 mr-1 text-yellow-400" />
                          {Number(template.mv_template_stats?.avg_stars || template.rating || 0).toFixed(1)}
                          <span className="text-gray-400 ml-1">
                            ({template.mv_template_stats?.ratings_count || 0})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {template.is_paid ? `$${(template.price_cents / 100).toFixed(2)}` : 'Free'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {new Date(template.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <Link
                            href={`/templates/${template.id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/templates/${template.id}/edit`}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => deleteTemplate(template.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}