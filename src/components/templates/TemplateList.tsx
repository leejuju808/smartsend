import { TemplateCard } from './TemplateCard';

interface Template {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  updated_at: string;
  created_at: string;
  is_paid?: boolean;
  price_cents?: number;
  cover_url?: string;
  installs_count?: number;
  avg_rating?: number;
  rating_count?: number;
}

interface TemplateListProps {
  searchParams?: { q?: string; tags?: string; limit?: string; sort?: string };
}

export async function TemplateList({ searchParams }: TemplateListProps) {
  const url = new URL(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/templates`, 'http://localhost');
  if (searchParams?.q) url.searchParams.set('q', searchParams.q);
  if (searchParams?.tags) url.searchParams.set('tags', searchParams.tags);
  if (searchParams?.limit) url.searchParams.set('limit', searchParams.limit);
  if (searchParams?.sort) url.searchParams.set('sort', searchParams.sort);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load templates');
  const json = await res.json();
  const items = (json?.data?.items ?? []) as Template[];

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
        <p className="text-gray-500">Try adjusting your search criteria or browse all templates.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((template) => (
        <TemplateCard key={template.id} {...template} />
      ))}
    </div>
  );
} 