// Block 67000 — Training Library Component
// AI-recommended training modules based on skill gaps

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, FileText, CheckSquare, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TrainingLibraryProps {
  workspaceId: string;
}

interface TrainingRecommendation {
  id: string;
  crew_member_id?: string;
  crew_member_name?: string;
  crew_id?: string;
  crew_name?: string;
  skill_area: string;
  recommendation_title: string;
  recommendation: string;
  training_type: 'video' | 'pdf' | 'checklist' | 'on_site' | 'workshop';
  training_resource_url?: string;
  training_duration_minutes?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'dismissed';
  created_at: string;
}

export function TrainingLibrary({ workspaceId }: TrainingLibraryProps) {
  const [recommendations, setRecommendations] = useState<TrainingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'urgent'>('all');

  useEffect(() => {
    fetchRecommendations();
  }, [workspaceId]);

  async function fetchRecommendations() {
    try {
      const supabase = createClient();
      
      let query = supabase
        .from('crew_training_recommendations')
        .select(`
          *,
          crew_members(name),
          crews(name)
        `)
        .eq('workspace_id', workspaceId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      } else if (filter === 'urgent') {
        query = query.eq('priority', 'urgent').in('status', ['pending', 'assigned']);
      }

      const { data } = await query;
      
      if (data) {
        setRecommendations(data.map((rec: any) => ({
          ...rec,
          crew_member_name: rec.crew_members?.name,
          crew_name: rec.crews?.name
        })));
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRecommendations();
  }, [filter]);

  function getTrainingIcon(type: string) {
    switch (type) {
      case 'video':
        return <Play className="h-5 w-5" />;
      case 'pdf':
        return <FileText className="h-5 w-5" />;
      case 'checklist':
        return <CheckSquare className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'in_progress':
        return 'text-blue-600';
      case 'assigned':
        return 'text-purple-600';
      default:
        return 'text-slate-600';
    }
  }

  async function handleAssignTraining(recommendationId: string) {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('crew_training_recommendations')
        .update({ status: 'assigned', assigned_at: new Date().toISOString() })
        .eq('id', recommendationId);

      if (!error) {
        fetchRecommendations();
      }
    } catch (error) {
      console.error('Error assigning training:', error);
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading training recommendations...</div>;
  }

  const filteredRecommendations = recommendations.filter(rec => {
    if (filter === 'all') return true;
    if (filter === 'pending') return rec.status === 'pending';
    if (filter === 'urgent') return rec.priority === 'urgent' && ['pending', 'assigned'].includes(rec.status);
    return true;
  });

  if (filteredRecommendations.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No training recommendations available. Run performance analysis to generate training recommendations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          All ({recommendations.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending ({recommendations.filter(r => r.status === 'pending').length})
        </button>
        <button
          onClick={() => setFilter('urgent')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            filter === 'urgent'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Urgent ({recommendations.filter(r => r.priority === 'urgent' && ['pending', 'assigned'].includes(r.status)).length})
        </button>
      </div>

      {/* Training Recommendations */}
      <div className="space-y-3">
        {filteredRecommendations.map((rec) => (
          <Card key={rec.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-blue-600">
                      {getTrainingIcon(rec.training_type)}
                    </div>
                    <h3 className="font-semibold text-slate-900">{rec.recommendation_title}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${getPriorityColor(rec.priority)}`}>
                      {rec.priority}
                    </span>
                    <span className={`text-xs font-medium ${getStatusColor(rec.status)}`}>
                      {rec.status}
                    </span>
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-3">{rec.recommendation}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {rec.crew_member_name && (
                      <span>
                        <strong>Member:</strong> {rec.crew_member_name}
                      </span>
                    )}
                    {rec.crew_name && (
                      <span>
                        <strong>Crew:</strong> {rec.crew_name}
                      </span>
                    )}
                    <span>
                      <strong>Skill:</strong> {rec.skill_area.replace('_', ' ')}
                    </span>
                    {rec.training_duration_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {rec.training_duration_minutes} min
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 ml-4">
                  {rec.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => handleAssignTraining(rec.id)}
                      className="whitespace-nowrap"
                    >
                      Assign
                    </Button>
                  )}
                  {rec.training_resource_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(rec.training_resource_url, '_blank')}
                      className="whitespace-nowrap"
                    >
                      View Training
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}




























