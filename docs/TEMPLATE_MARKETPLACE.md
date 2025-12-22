# Template Marketplace

The Template Marketplace is a feature that allows users to browse, search, and save email templates created by the community.

## Features

### Public Template Browsing
- **Browse Templates**: View all public templates in a grid layout
- **Search**: Search templates by title
- **Tag Filtering**: Filter templates by tags (comma-separated)
- **Responsive Design**: Works on desktop and mobile devices

### Template Details
- **Full Content View**: See the complete template content
- **Variable Display**: View all template variables with `{{variable}}` syntax
- **Metadata**: See tags, last updated date, and template ID
- **Save Functionality**: Save templates to your personal collection

### Personal Template Collection
- **My Templates**: View all templates you've saved
- **Authentication Required**: Must be signed in to access saved templates
- **Quick Access**: Easy navigation between marketplace and personal collection

## File Structure

```
src/
├── app/
│   ├── templates/
│   │   ├── page.tsx              # Main marketplace page
│   │   ├── loading.tsx           # Loading state
│   │   ├── error.tsx             # Error handling
│   │   └── [id]/
│   │       ├── page.tsx          # Template detail page
│   │       ├── loading.tsx       # Detail loading state
│   │       └── error.tsx         # Detail error handling
│   └── my/
│       └── templates/
│           └── page.tsx          # Personal templates page
├── components/
│   └── templates/
│       ├── TemplateCard.tsx      # Template preview card
│       ├── TemplateList.tsx      # Grid of templates
│       ├── TemplateSearch.tsx    # Search and filter form
│       ├── TemplateDetail.tsx    # Full template view
│       └── SaveButton.tsx        # Save template button
└── app/api/
    ├── templates/
    │   ├── route.ts              # List/search templates
    │   ├── [id]/route.ts         # Get template details
    │   └── save/route.ts         # Save template
    └── me/
        └── saved-templates/
            └── route.ts          # Get user's saved templates
```

## API Endpoints

### GET /api/templates
Lists public templates with optional search and filtering.

**Query Parameters:**
- `q`: Search query for template titles
- `tags`: Comma-separated tags to filter by
- `limit`: Maximum number of templates to return (default: 20)

**Response:**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "Template Title",
        "tags": ["tag1", "tag2"],
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### GET /api/templates/[id]
Gets detailed information about a specific template.

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "title": "Template Title",
    "body": "Template content with {{variables}}",
    "variables": ["variable1", "variable2"],
    "tags": ["tag1", "tag2"],
    "owner_id": "user-uuid",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### POST /api/templates/save
Saves a template to the user's collection.

**Request Body:**
```json
{
  "templateId": "template-uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "saved": true
  }
}
```

### GET /api/me/saved-templates
Gets the current user's saved templates.

**Response:**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "Template Title",
        "tags": ["tag1", "tag2"],
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

## Database Schema

The template marketplace uses the following database tables:

### templates
- `id`: UUID primary key
- `title`: Template title
- `body`: Template content
- `variables`: Array of variable names
- `tags`: Array of tags
- `visibility`: Template visibility ('public' or 'private')
- `owner_id`: User ID of template creator
- `updated_at`: Last modification timestamp

### saved_templates
- `id`: UUID primary key
- `user_id`: User ID
- `template_id`: Template ID
- `created_at`: When template was saved

## Usage

### For End Users
1. Navigate to `/templates` to browse the marketplace
2. Use search and tag filters to find specific templates
3. Click on a template to view full details
4. Click "Save Template" to add to your collection
5. Visit `/my/templates` to view your saved templates

### For Developers
1. Templates are automatically fetched from the database
2. Search and filtering happen on the server side
3. Template saving requires user authentication
4. All API responses follow a consistent format with `ok` and `data` fields

## Styling

The template marketplace uses Tailwind CSS for styling with:
- Responsive grid layouts
- Consistent spacing and typography
- Hover effects and transitions
- Loading states and error handling
- Mobile-first design approach

## Testing

Run the template marketplace tests with:
```bash
npm test tests/templates.test.ts
```

The tests verify:
- Template listing functionality
- Search and filtering
- Template detail retrieval
- Database operations 