# BLOCK 251000 — SmartSend Workforce Hub v1 Implementation

## ✅ Implementation Complete

**"Hiring, Training, Certification, Performance Tracking"**

This block turns SmartSend into the brain of their workforce. Roofing owners will straight up say:

> "We used to guess who's good… now SmartSend shows us. Our crews run tight. Other companies look sloppy."

This is the block that makes every roofing company feel embarrassingly outdated without SmartSend.

---

## 📊 Database Schema

### Migration File
`supabase/migrations/20251209150000_block251000_workforce_hub_v1.sql`

### Tables Created

1. **`workforce_employees`** - Tracks every worker in the company
   - Fields: id, company_id, first_name, last_name, phone, email, role, skill_level, status, hire_date
   - Roles: laborer, installer, foreman, project_manager, estimator, sales, office, other
   - Skill levels: apprentice, mid, senior, expert
   - Status: active, terminated, seasonal, on_leave

2. **`workforce_applicants`** - People applying for jobs
   - Fields: id, company_id, first_name, last_name, phone, email, position_applied, resume_url, status, notes
   - Status: new, review, interview, hired, rejected, withdrawn

3. **`workforce_training_modules`** - Defines training videos/documents
   - Fields: id, company_id, title, description, content_url, content_type, required_for_role, estimated_duration_minutes
   - Content types: video, pdf, slides, document, link

4. **`workforce_training_progress`** - Tracks employee progress through training
   - Fields: id, employee_id, module_id, status, started_at, completed_at, score, notes
   - Status: not_started, in_progress, completed, failed

5. **`workforce_certifications`** - OSHA, insurance, fall-protection, manufacturer certs
   - Fields: id, employee_id, cert_name, cert_type, issue_date, expiry_date, cert_file_url, issuing_organization, cert_number, notes
   - Types: osha, insurance, fall_protection, manufacturer, state_license, other

6. **`workforce_performance_logs`** - Performance reviews, attendance, incidents, notes
   - Fields: id, employee_id, log_type, notes, severity, created_by, created_at
   - Types: praise, issue, attendance, violation, review, incident, note
   - Severity: low, medium, high, critical

### Helper Functions

- `get_expiring_certifications(_company_id, _days_ahead)` - Get employees with expiring certifications
- `get_training_completion_stats(_company_id)` - Get training completion statistics

### Row Level Security (RLS)

All tables have RLS enabled with policies that check:
- User has access to the roofing company (via `roofing_company_members` table)
- All CRUD operations are scoped to the user's company

---

## 🔌 API Routes

### Employees
- `GET /api/workforce/employees` - List employees (with filters)
- `POST /api/workforce/employees` - Create employee
- `GET /api/workforce/employees/[id]` - Get employee with details
- `PATCH /api/workforce/employees/[id]` - Update employee
- `DELETE /api/workforce/employees/[id]` - Delete employee

### Applicants
- `GET /api/workforce/applicants` - List applicants (with filters)
- `POST /api/workforce/applicants` - Create applicant
- `PATCH /api/workforce/applicants/[id]` - Update applicant status (auto-creates employee if status = "hired")
- `DELETE /api/workforce/applicants/[id]` - Delete applicant

### Training
- `GET /api/workforce/training/modules` - List training modules
- `POST /api/workforce/training/modules` - Create training module
- `GET /api/workforce/training/progress` - Get training progress
- `POST /api/workforce/training/progress` - Update training progress

### Certifications
- `GET /api/workforce/certifications` - List certifications (with expiring filter)
- `POST /api/workforce/certifications` - Create certification
- `PATCH /api/workforce/certifications/[id]` - Update certification
- `DELETE /api/workforce/certifications/[id]` - Delete certification

### Performance
- `GET /api/workforce/performance` - List performance logs
- `POST /api/workforce/performance` - Create performance log

### Dashboard
- `GET /api/workforce/dashboard` - Get dashboard stats (employee counts, applicant counts, expiring certs, training stats, recent logs)

---

## 🎨 UI Components

### Main Dashboard Page
`src/app/dashboard/workforce/page.tsx`

Tabbed interface with:
- Dashboard (overview)
- Employees
- Hiring
- Training
- Certifications
- Performance

### Components

1. **`WorkforceDashboard`** (`src/components/workforce/WorkforceDashboard.tsx`)
   - Stats cards (total employees, active applicants, expiring certs, training modules)
   - Expiring certifications alert
   - Training completion progress
   - Recent performance logs

2. **`EmployeeList`** (`src/components/workforce/EmployeeList.tsx`)
   - Employee table with search and status filters
   - Add employee button
   - View employee details link

3. **`HiringPipeline`** (`src/components/workforce/HiringPipeline.tsx`)
   - Kanban board with status columns (New, Review, Interview, Hired, Rejected)
   - Drag-and-drop style status updates
   - Auto-creates employee when status = "hired"

4. **`TrainingModules`** (`src/components/workforce/TrainingModules.tsx`)
   - Grid of training modules
   - Shows required roles, duration, content type
   - Link to view content

5. **`CertificationsManager`** (`src/components/workforce/CertificationsManager.tsx`)
   - Table of all certifications
   - Filter for expiring certifications (30 days)
   - Status badges (Valid, Expiring, Expired)
   - Days until expiry display

6. **`PerformanceLogs`** (`src/components/workforce/PerformanceLogs.tsx`)
   - List of performance logs with icons
   - Filter by log type
   - Severity badges
   - Employee name and notes

---

## 📝 TypeScript Types

Added to `src/types/database.ts`:

- `WorkforceEmployee`
- `WorkforceApplicant`
- `WorkforceTrainingModule`
- `WorkforceTrainingProgress`
- `WorkforceCertification`
- `WorkforcePerformanceLog`
- Extended types with relations (e.g., `WorkforceEmployeeWithDetails`)

---

## 🔥 Key Features

### 1. Live Employee Roster
- See all employees at a glance
- Filter by status, role, search by name/email/phone
- View employee details with certifications, training, performance history

### 2. Training Automation
- Upload training modules (videos, PDFs, documents)
- Assign required training by role
- Track completion progress
- Automatic assignment when new hire is added

### 3. Certification Tracking
- Track OSHA, insurance, fall-protection, manufacturer certs
- Automatic alerts for expiring certifications (30 days)
- Prevent fines and shutdowns
- Upload certificate files

### 4. Performance History
- Document praise, issues, attendance, violations
- Severity levels (low, medium, high, critical)
- Clean documentation for reviews and promotions
- Prove performance issues with evidence

### 5. Hiring Pipeline
- Simple application → review → interview → hire flow
- No more lost resumes
- Auto-create employee when applicant is hired
- Track rejection reasons

---

## 🚀 Next Steps

To use this system:

1. **Run the migration:**
   ```bash
   supabase db push
   ```

2. **Access the Workforce Hub:**
   Navigate to `/dashboard/workforce`

3. **Start adding employees:**
   - Click "Add Employee" in the Employees tab
   - Fill in name, role, skill level, contact info

4. **Set up training:**
   - Add training modules in the Training tab
   - Assign required training by role
   - Employees will see their required modules

5. **Track certifications:**
   - Add certifications for each employee
   - Set expiry dates
   - Get automatic alerts for expiring certs

6. **Manage hiring:**
   - Add applicants in the Hiring tab
   - Move them through the pipeline
   - Auto-create employee when hired

7. **Log performance:**
   - Add performance logs for praise, issues, attendance
   - Document everything for reviews

---

## 💡 Why This Is a Power Move

No CRM in roofing has this in a simple format. Roofers will see this and say:

> "Holy shit… we don't have anything like this."
> "This makes my entire workforce organized."
> "This alone is worth the subscription."

This pushes SmartSend into must-have territory.

---

## 📋 Files Created

### Database
- `supabase/migrations/20251209150000_block251000_workforce_hub_v1.sql`

### Types
- Updated `src/types/database.ts`

### API Routes
- `src/app/api/workforce/employees/route.ts`
- `src/app/api/workforce/employees/[id]/route.ts`
- `src/app/api/workforce/applicants/route.ts`
- `src/app/api/workforce/applicants/[id]/route.ts`
- `src/app/api/workforce/training/modules/route.ts`
- `src/app/api/workforce/training/progress/route.ts`
- `src/app/api/workforce/certifications/route.ts`
- `src/app/api/workforce/certifications/[id]/route.ts`
- `src/app/api/workforce/performance/route.ts`
- `src/app/api/workforce/dashboard/route.ts`

### UI Components
- `src/app/dashboard/workforce/page.tsx`
- `src/components/workforce/WorkforceDashboard.tsx`
- `src/components/workforce/EmployeeList.tsx`
- `src/components/workforce/HiringPipeline.tsx`
- `src/components/workforce/TrainingModules.tsx`
- `src/components/workforce/CertificationsManager.tsx`
- `src/components/workforce/PerformanceLogs.tsx`

---

## ✅ Status: COMPLETE

All core functionality implemented:
- ✅ Database schema with 6 tables
- ✅ RLS policies for security
- ✅ API routes for all CRUD operations
- ✅ TypeScript types
- ✅ Full UI dashboard with all tabs
- ✅ Hiring pipeline kanban board
- ✅ Training module management
- ✅ Certification tracking with alerts
- ✅ Performance logging system

Ready for production use!
























