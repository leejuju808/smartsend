"use client";

// Block 251300 — Training Viewer Page
// Employee-facing training module player

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";
import { ArrowLeft, CheckCircle, Clock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

type TrainingModule = {
  id: string;
  title: string;
  description?: string | null;
  content_url: string;
  content_type: 'video' | 'pdf' | 'slides' | 'document' | 'link' | 'image' | 'url';
  duration_seconds?: number | null;
  estimated_duration_minutes?: number | null;
};

type TrainingProgress = {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  completed_at?: string | null;
};

export default function TrainingViewerPage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params?.moduleId as string;
  const supabase = createClientComponentClient();
  
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [progress, setProgress] = useState<TrainingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingComplete, setMarkingComplete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoProgress, setVideoProgress] = useState(0);

  useEffect(() => {
    if (moduleId) {
      load();
    }
  }, [moduleId]);

  async function load() {
    try {
      setLoading(true);
      
      // Load module
      const { data: mod, error: modError } = await supabase
        .from("workforce_training_modules")
        .select("*")
        .eq("id", moduleId)
        .single();

      if (modError) {
        console.error("Error loading module:", modError);
        return;
      }

      setModule(mod);

      // Get current user's employee record
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get company ID from user's membership
      const { data: membership } = await supabase
        .from("roofing_company_members")
        .select("roofing_company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!membership) return;

      // Get employee record (assuming user email matches employee email)
      const { data: employee } = await supabase
        .from("workforce_employees")
        .select("id")
        .eq("company_id", membership.roofing_company_id)
        .eq("email", user.email)
        .limit(1)
        .single();

      if (!employee) return;

      // Load progress
      const { data: prog, error: progError } = await supabase
        .from("workforce_training_progress")
        .select("*")
        .eq("module_id", moduleId)
        .eq("employee_id", employee.id)
        .maybeSingle();

      if (progError && progError.code !== 'PGRST116') {
        console.error("Error loading progress:", progError);
      } else {
        setProgress(prog || null);
      }
    } catch (error) {
      console.error("Error loading:", error);
    } finally {
      setLoading(false);
    }
  }

  async function markCompleted() {
    if (!module) return;

    try {
      setMarkingComplete(true);

      // Get current user's employee record
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("roofing_company_members")
        .select("roofing_company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!membership) return;

      const { data: employee } = await supabase
        .from("workforce_employees")
        .select("id")
        .eq("company_id", membership.roofing_company_id)
        .eq("email", user.email)
        .limit(1)
        .single();

      if (!employee) return;

      // Update or create progress
      const { data, error } = await supabase
        .from("workforce_training_progress")
        .upsert({
          employee_id: employee.id,
          module_id: moduleId,
          status: "completed",
          completed_at: new Date().toISOString(),
          company_id: membership.roofing_company_id,
        }, {
          onConflict: "employee_id,module_id"
        })
        .select()
        .single();

      if (error) {
        console.error("Error marking completed:", error);
      } else {
        setProgress({
          id: data.id,
          status: "completed",
          completed_at: data.completed_at,
        });
      }
    } catch (error) {
      console.error("Error marking completed:", error);
    } finally {
      setMarkingComplete(false);
    }
  }

  const handleVideoTimeUpdate = () => {
    if (!module?.duration_seconds || !videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime;
    const duration = module.duration_seconds;
    const watchedPercent = (currentTime / duration) * 100;
    
    setVideoProgress(watchedPercent);

    // Auto-complete at 90%
    if (watchedPercent >= 90 && progress?.status !== 'completed') {
      markCompleted();
    }
  };

  const handleVideoPlay = () => {
    if (progress?.status === 'not_started') {
      // Mark as in_progress
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      supabase
        .from("roofing_company_members")
        .select("roofing_company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single()
        .then(({ data: membership }) => {
          if (!membership) return;

          supabase
            .from("workforce_employees")
            .select("id")
            .eq("company_id", membership.roofing_company_id)
            .eq("email", user.email)
            .limit(1)
            .single()
            .then(({ data: employee }) => {
              if (!employee) return;

              supabase
                .from("workforce_training_progress")
                .upsert({
                  employee_id: employee.id,
                  module_id: moduleId,
                  status: "in_progress",
                  started_at: new Date().toISOString(),
                  company_id: membership.roofing_company_id,
                }, {
                  onConflict: "employee_id,module_id"
                })
                .then(({ data }) => {
                  if (data) {
                    setProgress({
                      id: data[0].id,
                      status: "in_progress",
                      completed_at: null,
                    });
                  }
                });
            });
        });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading training module...</p>
        </div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Module not found</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  const isCompleted = progress?.status === 'completed';
  const duration = module.duration_seconds 
    ? `${Math.floor(module.duration_seconds / 60)}:${String(module.duration_seconds % 60).padStart(2, '0')}`
    : module.estimated_duration_minutes 
    ? `${module.estimated_duration_minutes} min`
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{module.title}</h1>
              {module.description && (
                <p className="text-gray-600 mb-4">{module.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {duration && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {duration}
                  </div>
                )}
                {isCompleted && (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Completed
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="bg-white rounded-xl border shadow-sm p-6 mb-6">
          {module.content_type === "video" && (
            <div className="space-y-4">
              <video
                ref={videoRef}
                onTimeUpdate={handleVideoTimeUpdate}
                onPlay={handleVideoPlay}
                controls
                className="w-full rounded-lg border"
                src={module.content_url}
              />
              {module.duration_seconds && (
                <div className="text-sm text-gray-600">
                  Progress: {Math.round(videoProgress)}% watched
                </div>
              )}
            </div>
          )}

          {module.content_type === "pdf" && (
            <iframe
              src={module.content_url}
              className="w-full h-[800px] border rounded-lg"
              title={module.title}
            />
          )}

          {module.content_type === "image" && (
            <div className="flex justify-center">
              <img
                src={module.content_url}
                alt={module.title}
                className="max-w-full h-auto rounded-lg border shadow-sm"
              />
            </div>
          )}

          {(module.content_type === "url" || module.content_type === "link") && (
            <iframe
              className="w-full h-[800px] rounded-lg border"
              src={module.content_url}
              title={module.title}
            />
          )}

          {!['video', 'pdf', 'image', 'url', 'link'].includes(module.content_type) && (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">Content type: {module.content_type}</p>
              <a
                href={module.content_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Open Content →
              </a>
            </div>
          )}
        </div>

        {/* Completion Button */}
        {!isCompleted && (
          <div className="flex justify-center">
            <Button
              onClick={markCompleted}
              disabled={markingComplete}
              size="lg"
              className="px-8"
            >
              {markingComplete ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Marking Complete...
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Mark as Completed
                </>
              )}
            </Button>
          </div>
        )}

        {isCompleted && progress?.completed_at && (
          <div className="text-center">
            <p className="text-green-600 font-semibold flex items-center justify-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Completed on {new Date(progress.completed_at).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
























