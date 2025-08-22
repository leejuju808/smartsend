# Team Collaboration Features

SmartSend now includes powerful team collaboration features that enable multiple users to work together on email campaigns, templates, and outreach strategies.

## Overview

The team collaboration system provides:
- **Role-based access control** with Owner, Admin, and Member roles
- **Shared templates** accessible to all team members
- **Template comments** for feedback and collaboration
- **Campaign approval workflow** for quality control
- **Team activity feed** to track collaboration
- **Member management** with easy invitations

## Roles & Permissions

### Owner
- Full control over the workspace
- Can manage billing and subscription
- Can invite/remove team members
- Can change member roles
- Can delete the workspace

### Admin
- Can manage templates and campaigns
- Can approve/reject campaigns
- Can invite new team members
- Can manage team settings
- Cannot access billing

### Member
- Can send campaigns (if approved)
- Can use shared templates
- Can view dashboards and analytics
- Can add comments on templates
- Cannot manage team settings

## Features

### 1. Shared Templates
- All team members can access templates created by anyone in the workspace
- Templates are automatically shared when created
- Comments and feedback can be added to any template

### 2. Template Comments
- Leave inline feedback on email templates
- Real-time collaboration on content
- Comment history and user attribution
- Rich text support for detailed feedback

### 3. Campaign Approval Workflow
- **Draft**: Initial campaign creation
- **Pending Approval**: Submitted for review
- **Approved**: Ready to send
- **Rejected**: Needs revision

Only Admins and Owners can approve campaigns.

### 4. Team Activity Feed
- Track all team activities in real-time
- See who created templates, sent campaigns, etc.
- Monitor collaboration patterns
- Activity history for accountability

### 5. Member Management
- Invite new team members via email
- Assign appropriate roles
- Remove members when needed
- Role-based permissions enforcement

## Getting Started

### 1. Access Team Dashboard
Navigate to `/dashboard/team` to view your team overview.

### 2. Invite Team Members
1. Click "Invite Member" button
2. Enter email address
3. Select appropriate role
4. Send invitation

### 3. Create Shared Templates
1. Go to email generation
2. Create your template
3. It's automatically shared with the team

### 4. Add Comments
1. Open any template
2. Scroll to comments section
3. Add your feedback
4. Submit comment

### 5. Submit Campaigns for Approval
1. Create your campaign
2. Set status to "Pending Approval"
3. Wait for admin review
4. Make revisions if needed

## API Endpoints

### Template Comments
- `GET /api/templates/comments?template_id={id}` - Fetch comments
- `POST /api/templates/comments` - Add new comment

### Team Activities
- `GET /api/team/activities?workspace_id={id}` - Fetch team activities

### Campaign Approval
- `POST /api/campaigns/approve` - Approve/reject campaign

## Database Schema

### New Tables

#### `template_comments`
```sql
create table template_comments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
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

### Enhanced Tables

#### `email_templates`
- Added `workspace_id` for team sharing

#### `campaigns`
- Added `approval_status` (draft, pending_approval, approved, rejected)
- Added `approved_by` and `approved_at` for tracking

## Security & Privacy

- **Row Level Security (RLS)** ensures users only see data from their workspace
- **Role-based permissions** enforced at both UI and API levels
- **Audit trail** through team activities table
- **Data isolation** between different workspaces

## Best Practices

### For Team Leaders
- Start with a few admins and gradually expand
- Use comments to provide constructive feedback
- Set clear approval guidelines
- Monitor team activity for insights

### For Team Members
- Comment on templates to improve quality
- Submit campaigns early for approval
- Use shared templates to maintain consistency
- Check team activity to stay informed

### For Content Quality
- Review and approve campaigns promptly
- Provide specific feedback in comments
- Use approval workflow for all external communications
- Maintain template library standards

## Troubleshooting

### Common Issues

1. **Can't see team members**
   - Check if you're in the correct workspace
   - Verify your role permissions

2. **Template not shared**
   - Ensure template has workspace_id set
   - Check RLS policies

3. **Approval not working**
   - Verify you have admin/owner role
   - Check campaign approval status

4. **Comments not loading**
   - Check template_id parameter
   - Verify user permissions

### Support

For technical issues or questions about team collaboration features, please contact support or check the logs in `/dashboard/logs`.

## Future Enhancements

- **Real-time notifications** for comments and approvals
- **Template versioning** with change tracking
- **Advanced approval workflows** with multiple approvers
- **Team performance analytics** and insights
- **Integration** with project management tools
- **Mobile app** support for team collaboration 