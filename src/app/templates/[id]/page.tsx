import { notFound } from 'next/navigation';
import { MarketplaceTemplateDetail } from '@/components/templates/MarketplaceTemplateDetail';
import { getSupabaseServer } from '@/lib/supabase/server';

interface TemplateDetailPageProps {
  params: { id: string };
}

async function getMarketplaceTemplate(id: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('marketplace_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const template = await getMarketplaceTemplate(params.id);
  
  if (!template) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <MarketplaceTemplateDetail template={template} />
      </div>
    </div>
  );
} 