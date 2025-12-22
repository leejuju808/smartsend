// hooks/usePipelineBoard.ts
import useSWR from "swr";

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Contact {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  email?: string;
  phone?: string;
  lead_status?: string;
}

export interface PipelineItem {
  id: string;
  stage_id: string;
  contact: Contact;
}

export interface PipelineBoardData {
  stages: PipelineStage[];
  items: PipelineItem[];
}

export function usePipelineBoard(pipelineId: string | null) {
  const { data, error, mutate } = useSWR<PipelineBoardData>(
    pipelineId ? `/api/pipelines/${pipelineId}/board` : null,
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    stages: data?.stages || [],
    items: data?.items || [],
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}



























































