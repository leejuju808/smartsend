# Email Sequence Management System

This implementation provides a complete email sequence management system with the following features:

## Database Schema

Run the SQL in `sequences-schema.sql` in your Supabase SQL editor to create the required tables:

- `sequences` - Stores email sequences owned by users
- `sequence_steps` - Stores individual steps within each sequence

## API Endpoints

### Sequences Collection (`/api/sequences`)
- `GET` - List all sequences for the authenticated user
- `POST` - Create a new sequence

### Single Sequence (`/api/sequences/[id]`)
- `GET` - Get sequence details with all steps
- `PUT` - Update sequence name
- `DELETE` - Delete sequence and all its steps

### Sequence Steps (`/api/sequences/[id]/steps`)
- `POST` - Add a new step to a sequence
- `PUT` - Bulk update/reorder steps

### Individual Step (`/api/sequences/[id]/steps/[stepId]`)
- `DELETE` - Delete a specific step

## UI Pages

### Sequences List (`/sequences`)
- View all sequences
- Create new sequences
- Navigate to sequence editor

### Sequence Editor (`/sequences/[id]`)
- Edit sequence name (auto-saves)
- Add new steps with prompts
- Edit step details inline
- Reorder steps with up/down buttons
- Delete individual steps
- Save changes to database
- Delete entire sequence

## Features

- **User Authentication**: All operations require authentication
- **Ownership Security**: Users can only access their own sequences
- **Step Management**: Add, edit, delete, and reorder steps
- **Delay Configuration**: Set delay hours between steps
- **Auto-save**: Sequence name changes are saved automatically
- **Bulk Operations**: Save all step changes at once
- **Responsive Design**: Works on desktop and mobile

## Usage

1. Run the SQL schema in Supabase
2. Navigate to `/sequences` to see your sequences
3. Click "Create" to add a new sequence
4. Click on a sequence to edit it
5. Use "Add Step" to add email steps
6. Edit step details inline
7. Use up/down arrows to reorder steps
8. Click "Save Changes" to persist modifications

The system is ready to use and integrates with your existing Supabase authentication setup.