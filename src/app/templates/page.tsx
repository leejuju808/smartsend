'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/utils/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Template {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  likes: number;
  is_public: boolean;
}

export default function TemplatesPage() {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadUserAndTemplates() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('is_public', true)
        .order('likes', { ascending: false });

      if (!error && data) {
        setTemplates(data);
      }
      setLoading(false);
    }
    loadUserAndTemplates();
  }, [supabase]);

  function handleUseTemplate(template: Template) {
    // Stash in cookies for prefill
    document.cookie = `prefill_subject=${encodeURIComponent(
      template.subject
    )}; path=/`;
    document.cookie = `prefill_body=${encodeURIComponent(template.body)}; path=/`;
    // Redirect to composer
    router.push('/dashboard/composer');
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Template Gallery</h1>

      {loading ? (
        <div className="text-center py-12">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No public templates available yet
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {template.category}
                </p>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="text-sm font-medium mb-1">Subject:</p>
                  <p className="text-xs text-gray-600">{template.subject}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium mb-1">Preview:</p>
                  <p className="text-xs text-gray-600 line-clamp-3">
                    {template.body}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {template.likes} likes
                  </span>
                  <Button
                    onClick={() => handleUseTemplate(template)}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Use this
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
