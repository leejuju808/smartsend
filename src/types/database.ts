export interface User {
  id: string
  email: string
  created_at: string
  updated_at: string
  subscription_status?: 'free' | 'pro' | 'cancelled'
  stripe_customer_id?: string
  email_credits?: number
}

export interface EmailTemplate {
  id: string
  user_id: string
  target_audience: string
  product_service: string
  tone: 'professional' | 'casual' | 'friendly' | 'formal'
  generated_emails: string
  optimized_version?: string
  performance_notes?: string
  created_at: string
  updated_at: string
  user?: {
    email: string
  }
}

export interface TemplateSuggestion {
  id: string
  template_id: string
  suggestion: string
  suggestion_type: 'subject' | 'body' | 'tone' | 'personalization'
  ai_score?: number
  created_at: string
  accepted: boolean
}

export interface AISuggestion {
  type: 'subject' | 'body' | 'tone' | 'personalization'
  content: string
  score: number
  reasoning: string
}

export interface AIOptimizationResult {
  suggestions: AISuggestion[]
  overall_score: number
  performance_notes: string
}

export interface TemplateComment {
  id: string
  template_id: string
  user_id: string
  comment: string
  created_at: string
  user?: {
    email: string
  }
}

// Marketplace Template Types
export interface MarketplaceTemplate {
  id: string
  title: string
  body: string
  variables: string[]
  tags: string[]
  owner_id: string
  visibility: 'public' | 'private'
  created_at: string
  updated_at: string
}

export interface SavedTemplate {
  user_id: string
  template_id: string
  created_at: string
  template: MarketplaceTemplate
}

export interface TeamActivity {
  id: string
  workspace_id: string
  user_id: string
  action: string
  entity_type: string
  entity_id?: string
  details?: any
  created_at: string
  user?: {
    email: string
  }
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
  outreach_state?: 'running' | 'paused'
  outreach_paused_at?: string | null
  outreach_last_paused_at?: string | null
  outreach_last_resumed_at?: string | null
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
  user?: {
    email: string
  }
}

// BLOCK 282000 — Internal Sales Execution Types
export interface SalesLead {
  id: string
  company_name: string
  owner_name?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  state?: string | null
  source: 'cold_email' | 'referral' | 'inbound'
  status: 'prospect' | 'demo_booked' | 'trial' | 'paid' | 'lost'
  notes?: string | null
  created_at: string
  updated_at: string
}

// Tracking System Types
export interface TrackingLink {
  token: string
  workspace_id: string
  url: string
  email: string
  subscriber_id?: string
  sequence_id?: string
  step_no?: number
  created_at: string
}

export interface OpenToken {
  token: string
  workspace_id: string
  email: string
  subscriber_id?: string
  sequence_id?: string
  created_at: string
}

export interface OpenEvent {
  id: string
  workspace_id: string
  token: string
  email?: string
  subscriber_id?: string
  sequence_id?: string
  user_agent?: string
  ip?: string
  created_at: string
}

export interface ClickEvent {
  id: string
  workspace_id: string
  token: string
  url: string
  email?: string
  subscriber_id?: string
  sequence_id?: string
  user_agent?: string
  ip?: string
  created_at: string
}

export interface Campaign {
  id: string
  workspace_id?: string
  user_id: string
  name: string
  approval_status?: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  approved_by?: string
  approved_at?: string
  auto_stop_on_reply?: boolean
  created_at: string
  updated_at: string
  user?: {
    email: string
  }
}

export interface Subscription {
  id: string
  user_id: string
  stripe_subscription_id: string
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid'
  current_period_end: string
  created_at: string
  updated_at: string
}

export interface TrialEmail {
  id: string
  user_id: string
  email: string
  type: 'trial_expired'
  created_at: string
}

// =========================================================
// Block 251000 — SmartSend Workforce Hub v1 Types
// =========================================================

export interface WorkforceEmployee {
  id: string
  company_id: string
  first_name: string
  last_name: string
  phone?: string | null
  email?: string | null
  role: 'laborer' | 'installer' | 'foreman' | 'project_manager' | 'estimator' | 'sales' | 'office' | 'other'
  skill_level: 'apprentice' | 'mid' | 'senior' | 'expert'
  status: 'active' | 'terminated' | 'seasonal' | 'on_leave'
  hire_date?: string | null
  daily_capacity_hours?: number | null
  weekly_capacity_hours?: number | null
  created_at: string
  updated_at: string
}

export interface WorkforceApplicant {
  id: string
  company_id: string
  first_name: string
  last_name: string
  phone?: string | null
  email?: string | null
  position_applied: string
  resume_url?: string | null
  status: 'new' | 'review' | 'interview' | 'hired' | 'rejected' | 'withdrawn'
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface WorkforceTrainingModule {
  id: string
  company_id: string
  title: string
  description?: string | null
  content_url: string
  content_type: 'video' | 'pdf' | 'slides' | 'document' | 'link' | 'image' | 'url'
  required_for_role?: string | null
  estimated_duration_minutes?: number | null
  duration_seconds?: number | null
  position_order?: number | null
  created_at: string
  updated_at: string
}

export interface WorkforceTrainingProgress {
  id: string
  employee_id: string
  module_id: string
  status: 'not_started' | 'in_progress' | 'completed' | 'failed'
  started_at?: string | null
  completed_at?: string | null
  score?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface WorkforceCertification {
  id: string
  employee_id: string
  cert_name: string
  cert_type: 'osha' | 'insurance' | 'fall_protection' | 'manufacturer' | 'state_license' | 'other'
  issue_date: string
  expiry_date?: string | null
  cert_file_url?: string | null
  issuing_organization?: string | null
  cert_number?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface WorkforcePerformanceLog {
  id: string
  employee_id: string
  log_type: 'praise' | 'issue' | 'attendance' | 'violation' | 'review' | 'incident' | 'note'
  notes: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  created_by?: string | null
  created_at: string
}

// =========================================================
// Block 252400 — Equipment & Asset Tracking System Types
// =========================================================

export interface Asset {
  id: string
  company_id: string
  name: string
  category: 'ladder' | 'truck' | 'trailer' | 'blower' | 'harness' | 'nail_gun' | 'compressor' | 'saw' | 'tool' | 'vehicle' | 'other'
  serial_number?: string | null
  status: 'available' | 'assigned' | 'maintenance' | 'lost' | 'retired'
  photo_url?: string | null
  purchase_date?: string | null
  purchase_price?: number | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface AssetAssignment {
  id: string
  asset_id: string
  employee_id?: string | null
  job_id?: string | null
  assigned_at: string
  returned_at?: string | null
  assigned_by_user_id?: string | null
  notes?: string | null
  created_at: string
}

export interface AssetDamageReport {
  id: string
  asset_id: string
  employee_id?: string | null
  job_id?: string | null
  description: string
  severity: 'minor' | 'moderate' | 'critical'
  photo_url?: string | null
  reported_at: string
  reported_by_user_id?: string | null
  resolved: boolean
  resolved_at?: string | null
  resolved_by_user_id?: string | null
  resolution_notes?: string | null
  created_at: string
}

export interface AssetMaintenance {
  id: string
  asset_id: string
  maintenance_type: string
  interval_days: number
  last_completed?: string | null
  next_due: string
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface AssetHistory {
  asset_id: string
  asset_name: string
  category: string
  company_id: string
  employee_id?: string | null
  employee_name?: string | null
  job_id?: string | null
  job_stage?: string | null
  assigned_at: string
  returned_at?: string | null
  assignment_status: 'assigned' | 'returned'
  days_assigned?: number | null
}

export interface AssetWithDetails extends Asset {
  current_assignment?: AssetAssignment | null
  open_damage_reports?: AssetDamageReport[]
  next_maintenance?: AssetMaintenance | null
}

// =========================================================
// Block 251900 — Crew Assignment Engine Types
// =========================================================

export interface CrewAssignment {
  id: string
  job_id: string
  employee_id: string
  assigned_date: string
  assigned_by?: string | null
  role_on_job?: string | null
  created_at: string
}

export interface JobRequirement {
  id: string
  job_id: string
  required_role: string
  quantity_needed: number
  skill_level?: 'apprentice' | 'mid' | 'senior' | 'expert' | null
  created_at: string
}

export interface JobStaffingStatus {
  id: string
  company_id: string
  customer_name: string
  address?: string | null
  production_date?: string | null
  job_type?: string | null
  required_positions: number
  assigned_positions: number
  staffing_status: 'needs_crew' | 'fully_staffed' | 'overstaffed'
}

export interface CrewConflict {
  employee_id: string
  employee_name: string
  assigned_date: string
  jobs_count: number
  job_ids: string[]
  conflict_type: string
}

export interface EmployeeWorkload {
  assigned_date: string
  jobs_count: number
  job_ids: string[]
  job_names: string[]
}

// Extended types with relations
export interface WorkforceEmployeeWithDetails extends WorkforceEmployee {
  certifications?: WorkforceCertification[]
  training_progress?: (WorkforceTrainingProgress & { module?: WorkforceTrainingModule })[]
  performance_logs?: WorkforcePerformanceLog[]
  expiring_certifications_count?: number
  completed_training_count?: number
  total_training_count?: number
}

export interface WorkforceApplicantWithDetails extends WorkforceApplicant {
  // Future: could add interview notes, references, etc.
}

export interface WorkforceTrainingModuleWithStats extends WorkforceTrainingModule {
  total_employees?: number
  completed_count?: number
  in_progress_count?: number
  not_started_count?: number
  completion_percentage?: number
}

// =========================================================
// Block 252000 — SmartSend Payroll Engine v1 Types
// =========================================================

export interface RolePayRate {
  id: string
  company_id: string
  role: string
  hourly_rate: number
  overtime_multiplier: number
  doubletime_multiplier: number
  created_at: string
  updated_at: string
}

export interface PayrollPeriod {
  id: string
  company_id: string
  week_start: string
  week_end: string
  status: 'open' | 'locked'
  locked_at?: string | null
  locked_by?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface PayrollEntry {
  id: string
  employee_id: string
  period_id: string
  total_hours: number
  regular_hours: number
  overtime_hours: number
  doubletime_hours: number
  total_pay: number
  created_at: string
  updated_at: string
}

export interface PayrollWeeklySummary {
  employee_id: string
  company_id: string
  week_start: string
  week_end: string
  total_hours: number
  regular_hours: number
  overtime_hours: number
}

export interface PayrollDiscrepancy {
  type: 'missing_clock_out' | 'over_14_hours' | 'multiple_clock_ins' | 'gps_mismatch'
  employee_id: string
  employee_name: string
  job_id: string
  job_address?: string
  clock_in?: string
  clock_out?: string
  duration_minutes?: number
  details: string
}

export interface PayrollEmployeeSummary {
  employee_id: string
  employee_name: string
  role: string
  total_hours: number
  regular_hours: number
  overtime_hours: number
  total_pay: number
  status: 'pending' | 'finalized'
  discrepancies: PayrollDiscrepancy[]
}

// =========================================================
// Block 251400 — SmartSend Safety System v1 Types
// =========================================================

export interface ToolboxTalk {
  id: string
  company_id: string
  title: string
  description?: string | null
  content_url?: string | null
  created_at: string
  updated_at: string
}

export interface ToolboxTalkSession {
  id: string
  talk_id: string
  company_id: string
  date: string
  location?: string | null
  foreman_id?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface ToolboxTalkSignoff {
  id: string
  session_id: string
  employee_id: string
  signed_at: string
  signed_by_foreman: boolean
  foreman_id?: string | null
}

export interface SafetyIncident {
  id: string
  company_id: string
  employee_id?: string | null
  date: string
  incident_type: 'near_miss' | 'injury' | 'property_damage' | 'equipment_failure' | 'safety_violation' | 'other'
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reported_by?: string | null
  photo_url?: string | null
  created_at: string
  updated_at: string
}

// Extended types with relations
export interface ToolboxTalkWithSession extends ToolboxTalk {
  sessions?: ToolboxTalkSession[]
  sessions_count?: number
}

export interface ToolboxTalkSessionWithDetails extends ToolboxTalkSession {
  talk?: ToolboxTalk
  foreman?: WorkforceEmployee
  signoffs?: (ToolboxTalkSignoff & { employee?: WorkforceEmployee })[]
  signoffs_count?: number
}

export interface SafetyIncidentWithDetails extends SafetyIncident {
  employee?: WorkforceEmployee
  reported_by_employee?: WorkforceEmployee
}

// =========================================================
// Block 252200 — QC Engine Types
// =========================================================

export interface QCChecklistTemplate {
  id: string
  company_id: string
  job_type: string
  category: string
  item: string
  requires_photo: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface QCInspection {
  id: string
  job_id: string
  foreman_id?: string | null
  started_at: string
  completed_at?: string | null
  status: 'in_progress' | 'completed' | 'pending_customer_signoff'
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface QCInspectionItem {
  id: string
  inspection_id: string
  template_id?: string | null
  category?: string | null
  item?: string | null
  passed?: boolean | null
  photo_url?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface QCPunchListItem {
  id: string
  job_id: string
  inspection_id?: string | null
  inspection_item_id?: string | null
  description: string
  assigned_to?: string | null
  status: 'open' | 'in_progress' | 'completed'
  created_at: string
  completed_at?: string | null
  updated_at: string
}

export interface CustomerSignoff {
  id: string
  job_id: string
  inspection_id?: string | null
  customer_name: string
  signature_url: string
  signed_at: string
  ip_address?: string | null
  user_agent?: string | null
  created_at: string
}

export interface QCInspectionWithDetails extends QCInspection {
  foreman?: WorkforceEmployee
  items?: QCInspectionItem[]
  punch_list_items?: QCPunchListItem[]
  customer_signoff?: CustomerSignoff
}

export interface QCPunchListItemWithDetails extends QCPunchListItem {
  assigned_employee?: WorkforceEmployee
  inspection?: QCInspection
}

// =========================================================
// Block 252900 — SmartSend Vehicle & Fleet Management v1 Types
// =========================================================

export interface Vehicle {
  id: string
  company_id: string
  name: string
  license_plate?: string | null
  vin?: string | null
  make?: string | null
  model?: string | null
  year?: number | null
  status: 'active' | 'maintenance' | 'retired'
  photo_url?: string | null
  health_score: number
  created_at: string
  updated_at: string
}

export interface VehicleAssignment {
  id: string
  vehicle_id: string
  employee_id: string
  job_id?: string | null
  assigned_at: string
  returned_at?: string | null
  notes?: string | null
}

export interface MileageLog {
  id: string
  vehicle_id: string
  employee_id: string
  start_miles: number
  end_miles: number
  total_miles: number
  date: string
  job_id?: string | null
  start_odometer_photo_url?: string | null
  end_odometer_photo_url?: string | null
  condition_check?: {
    tires?: boolean
    lights?: boolean
    ladders_secure?: boolean
  } | null
  damage_report?: string | null
  created_at: string
}

export interface FuelLog {
  id: string
  vehicle_id: string
  employee_id: string
  gallons: number
  cost: number
  receipt_url?: string | null
  photo_url?: string | null
  pump_photo_url?: string | null
  filled_at: string
  created_at: string
}

export interface VehicleMaintenance {
  id: string
  vehicle_id: string
  maintenance_type: 'oil_change' | 'tire_rotation' | 'inspection' | 'brake_service' | 'filter_replacement' | 'other'
  interval_miles: number
  last_mileage: number
  next_due_mileage: number
  last_service_date?: string | null
  next_due_date?: string | null
  notes?: string | null
  is_overdue: boolean
  created_at: string
  updated_at: string
}

export interface DashcamUpload {
  id: string
  vehicle_id: string
  employee_id?: string | null
  job_id?: string | null
  video_url: string
  incident_notes?: string | null
  incident_type?: 'accident' | 'near_miss' | 'violation' | 'evidence' | 'routine' | 'other' | null
  uploaded_by?: string | null
  uploaded_at: string
}

// =========================================================
// Block 257900 — SmartSend AI Executive Brain v1 Types
// =========================================================

export interface ExecutiveHealthScore {
  id: string
  roofing_company_id: string
  overall_score: number
  categories: {
    sales?: number
    production?: number
    finances?: number
    reputation?: number
    staffing?: number
    [key: string]: number | undefined
  }
  snapshot_date: string
  notes?: string | null
  created_at: string
}

export type ExecutiveAlertSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface ExecutiveAlert {
  id: string
  roofing_company_id: string
  alert_type: string
  message: string
  severity: ExecutiveAlertSeverity
  context?: any
  acknowledged: boolean
  acknowledged_at?: string | null
  created_at: string
}

export interface ExecutiveRecommendation {
  id: string
  roofing_company_id: string
  recommendation: string
  category: string
  context?: any
  target_date: string
  completed: boolean
  completed_at?: string | null
  created_at: string
}

// =========================================================
// Block 258200 — SmartSend AI Risk Prevention & Safety Brain v1 Types
// =========================================================

export type SafetySeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface SafetyEvent {
  id: string
  job_id?: string | null
  crew_id?: string | null
  crew_member_id?: string | null
  workspace_id?: string | null
  event_type: string
  severity: SafetySeverityLevel
  description?: string | null
  photos?: string[] | null
  weather?: any
  source?: string | null
  metadata?: any
  created_at: string
}

export interface IncidentPrediction {
  id: string
  job_id?: string | null
  crew_id?: string | null
  workspace_id?: string | null
  probability: number // 0.0–1.0
  risk_level: SafetySeverityLevel
  risk_factors: any
  valid_for_date: string
  created_at: string
}

export interface CrewSafetyScoreSnapshot {
  id: string
  crew_id?: string | null
  job_id?: string | null
  score: number
  calculated_at: string
  score_breakdown?: any
  created_at: string
}