import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { SavedTemplateList } from '@/components/templates/SavedTemplateList';

export default async function MyTemplatesPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            My Saved Templates
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Access your saved templates and start building effective email campaigns.
          </p>
        </div>

        <SavedTemplateList userId={user.id} />
      </div>
    </div>
  );
} 