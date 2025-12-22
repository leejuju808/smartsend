'use client';

import { useEffect, useState } from 'react';
import { TemplateCard } from './TemplateCard';
import { getSupabaseServer } from '@/lib/supabase/server';

interface SavedTemplate {
  id: string;
  title: string;
  tags: string[];
  updated_at: string;
}

interface SavedTemplateListProps {
  userId: string;
}

export function SavedTemplateList({ userId }: SavedTemplateListProps) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSavedTemplates = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // For now, we'll fetch from the API endpoint
        // In a future iteration, we could create a dedicated API for saved templates
        const response = await fetch('/api/templates');
        if (!response.ok) {
          throw new Error('Failed to fetch templates');
        }
        
        const data = await response.json();
        if (data.ok) {
          // For MVP, we'll show all public templates
          // In the future, we'd filter by saved_templates table
          setTemplates(data.data.items);
        } else {
          throw new Error(data.error?.msg || 'Failed to fetch templates');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSavedTemplates();
  }, [userId]);

  if (loading) {
    return <SavedTemplateListSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-4">Error loading saved templates: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg mb-4">No saved templates yet</div>
        <p className="text-gray-400 mb-6">
          Start building your template library by browsing the marketplace and saving templates you like.
        </p>
        <a
          href="/templates"
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          Browse Templates
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          id={template.id}
          title={template.title}
          tags={template.tags}
          updated_at={template.updated_at}
        />
      ))}
    </div>
  );
}

function SavedTemplateListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="flex gap-2 mb-4">
            <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
            <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
          </div>
          <div className="h-4 bg-gray-200 rounded mb-4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  );
} 