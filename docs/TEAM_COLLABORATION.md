# Team Collaboration Features

SmartSend AI now includes comprehensive team collaboration features that allow multiple users to work together on email campaigns, templates, and campaigns with proper role-based access control.

## 🏗️ Architecture Overview

The team collaboration system is built on top of the existing workspace infrastructure and includes:

- **Team Management**: Invite, manage, and assign roles to team members
- **Shared Templates**: Central library for team-created email templates
- **Template Comments**: Inline feedback and collaboration on templates
- **Approval Workflow**: Manager approval system for campaigns
- **Activity Feed**: Real-time tracking of team actions
- **Role-Based Permissions**: Granular access control based on user roles

## 🗄️ Database Schema

### Core Tables

#### `team_members`
```sql
create table team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  role text check (role in ('owner','admin','member')) default 'member',
  joined_at timestamptz default now()
);
```

#### `template_comments`
```sql
create table template_comments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete cascade,
  user_id uuid references users(id),
  comment text not null,
  created_at timestamptz default now()
);
```

#### `team_activities`
```sql
create table team_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz default now()
);
```

## 👥 User Roles & Permissions

### Owner
- **Full Control**: Manage billing, invites, team settings
- **Team Management**: Add/remove members, change roles
- **Workspace Settings**: Configure workspace preferences
- **Billing Access**: View and manage subscription

### Admin
- **Team Management**: Invite new members, manage existing ones
- **Template Management**: Create, edit, and approve templates
- **Campaign Approval**: Review and approve campaigns
- **Analytics Access**: View team performance metrics

### Member
- **Template Usage**: Access shared template library
- **Campaign Creation**: Create and submit campaigns for approval
- **Comments**: Leave feedback on templates
- **Dashboard Access**: View team activity and metrics

## 🔐 Permission System

The permission system is implemented through utility functions in `src/utils/permissions.ts`:

```typescript
export function canManageBilling(role: UserRole | string | null | undefined): boolean
export function canManageMembers(role: UserRole | string | null | undefined): boolean
export function canSendCampaign(role: UserRole | string | null | undefined): boolean
export function canManageTemplates(role: UserRole | string | null | undefined): boolean
export function canApproveCampaigns(role: UserRole | string | null | undefined): boolean
export function canViewTeamActivity(role: UserRole | string | null | undefined): boolean
export function canInviteMembers(role: UserRole | string | null | undefined): boolean
```

## 🎯 Key Features

### 1. Shared Templates Library

**Component**: `SharedTemplatesLibrary.tsx`
**Location**: `src/components/template/SharedTemplatesLibrary.tsx`

Features:
- Browse all team-created templates
- Search and filter by tone, audience, or content
- Preview template content before use
- Copy templates to clipboard
- View template metadata and creator

### 2. Template Comments System

**Component**: `TemplateComments.tsx`
**Location**: `src/components/template/TemplateComments.tsx`

Features:
- Inline comments on templates
- Real-time comment updates
- User attribution for comments
- Comment threading and history

### 3. Enhanced Template Editor

**Component**: `TemplateEditor.tsx`
**Location**: `src/components/template/TemplateEditor.tsx`

Features:
- Integrated commenting sidebar
- Real-time collaboration
- Template metadata editing
- Email preview and editing
- Save and version control

### 4. Campaign Approval Workflow

**Component**: `CampaignApproval.tsx`
**Location**: `src/components/campaign/CampaignApproval.tsx`

Features:
- Manager review of campaigns
- Approve/reject functionality
- Status tracking (draft, pending, approved, rejected)
- Approval history and audit trail

### 5. Team Activity Feed

**Component**: `TeamActivityFeed.tsx`
**Location**: `src/components/team/TeamActivityFeed.tsx`

Features:
- Real-time activity updates
- Action categorization and icons
- Time-based formatting
- Expandable activity list
- Live subscription to new activities

### 6. Team Dashboard

**Component**: Team Dashboard
**Location**: `src/app/dashboard/team/page.tsx`

Features:
- Team member management
- Role assignment and management
- Team statistics and overview
- Recent activity summary
- Member invitation system

## 🚀 Getting Started

### 1. Database Setup

Run the migration files in order:

```bash
# 1. Team members table
supabase/migrations/20250916_team_members_final.sql

# 2. Team collaboration features
supabase/migrations/20250915_team_collaboration.sql

# 3. Teams and sharing
supabase/migrations/20250912_teams_and_sharing.sql
```

### 2. Component Integration

To use the team collaboration components in your pages:

```tsx
import SharedTemplatesLibrary from '@/components/template/SharedTemplatesLibrary'
import TemplateComments from '@/components/template/TemplateComments'
import CampaignApproval from '@/components/campaign/CampaignApproval'
import TeamActivityFeed from '@/components/team/TeamActivityFeed'

// Example usage
<SharedTemplatesLibrary 
  workspaceId={workspaceId} 
  userRole={userRole} 
/>
```

### 3. Permission Checks

Always check permissions before rendering components:

```tsx
import { canManageTemplates, canApproveCampaigns } from '@/utils/permissions'

// Example
{canManageTemplates(userRole) && (
  <TemplateEditor templateId={id} workspaceId={workspaceId} />
)}
```

## 💰 Pricing Tiers

### Free Plan
- Solo use only
- 5 email templates per month
- Basic features

### Pro Plan ($29/month)
- Up to 5 team members
- Shared template library
- Template comments & feedback
- Campaign approval workflow
- Team activity feed
- Advanced analytics

### Scale Plan ($99/month)
- Unlimited team members
- SSO integration
- Advanced role management
- API access
- Custom integrations
- Dedicated support

## 🔄 Real-time Features

The system uses Supabase real-time subscriptions for:

- **Live Activity Updates**: New team activities appear instantly
- **Comment Synchronization**: Template comments update in real-time
- **Status Changes**: Campaign approval status updates immediately
- **Team Changes**: Member additions/removals reflect instantly

## 📱 UI/UX Features

### Responsive Design
- Mobile-first approach
- Tablet and desktop optimized
- Touch-friendly interactions

### Accessibility
- ARIA labels and descriptions
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support

### Performance
- Lazy loading of components
- Optimized database queries
- Efficient state management
- Minimal re-renders

## 🧪 Testing

### Component Testing
Each component includes:
- Unit tests for core functionality
- Integration tests for API calls
- Mock data for development
- Error boundary handling

### Database Testing
- Migration rollback testing
- RLS policy verification
- Performance benchmarking
- Data integrity checks

## 🔒 Security Features

### Row Level Security (RLS)
- All tables have RLS enabled
- Policies based on team membership
- User isolation and data privacy
- Audit trail for all actions

### Authentication
- Supabase Auth integration
- JWT token validation
- Session management
- Secure API endpoints

### Data Validation
- Input sanitization
- SQL injection prevention
- XSS protection
- Rate limiting

## 🚨 Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Check user role assignment
   - Verify team membership
   - Confirm RLS policies

2. **Real-time Not Working**
   - Check Supabase connection
   - Verify channel subscriptions
   - Check network connectivity

3. **Template Not Loading**
   - Verify workspace_id assignment
   - Check user permissions
   - Validate database relationships

### Debug Mode

Enable debug logging:

```typescript
// In development
const supabase = createClientComponentClient({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  options: {
    db: {
      schema: 'public'
    },
    auth: {
      debug: true
    }
  }
})
```

## 📈 Future Enhancements

### Planned Features
- **Advanced Analytics**: Team performance metrics
- **Workflow Automation**: Custom approval rules
- **Integration APIs**: Third-party service connections
- **Advanced Permissions**: Granular access control
- **Audit Logging**: Comprehensive activity tracking

### Performance Improvements
- **Caching Layer**: Redis integration for faster queries
- **CDN Integration**: Global content delivery
- **Database Optimization**: Query performance tuning
- **Lazy Loading**: On-demand component loading

## 🤝 Contributing

When adding new team collaboration features:

1. **Follow the existing patterns** for components and permissions
2. **Add proper TypeScript types** for all new interfaces
3. **Include RLS policies** for new tables
4. **Add permission checks** for new functionality
5. **Update this documentation** with new features
6. **Include tests** for new components

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🆘 Support

For questions or issues with team collaboration features:

1. Check the troubleshooting section above
2. Review the database migrations
3. Verify component integration
4. Check browser console for errors
5. Contact the development team

---

*Last updated: September 2024*
*Version: 1.0.0* 