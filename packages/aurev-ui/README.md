# @aurev/ui

AUREV 2.0 Design System - Shared UI components for SmartSend, OpsGrid, AgentCloud, and HQ.

## Installation

```bash
npm install @aurev/ui
```

## Usage

```tsx
import { Button, Card, Badge, Layout, Container } from "@aurev/ui";

export function MyComponent() {
  return (
    <Layout variant="dashboard">
      <Container maxWidth="lg">
        <Card>
          <Badge label="New" />
          <Button variant="primary">Get Started</Button>
        </Card>
      </Container>
    </Layout>
  );
}
```

## Components

### Button

Primary action button with AUREV gold branding.

```tsx
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
```

### Card

Content container with dark surface styling.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

### Badge

Status indicator with gold accent.

```tsx
<Badge label="Pro" />
<Badge variant="gold">Featured</Badge>
<Badge variant="outline">New</Badge>
```

### Layout & Container

Page-level layout components.

```tsx
<Layout variant="dashboard">
  <Container maxWidth="lg">
    {/* Content */}
  </Container>
</Layout>
```

## Brand Colors

- **Gold**: `#FFD700` (Primary brand color)
- **Black**: `#0A0A0A` (Primary background)
- **Surface**: `#121212` (Secondary background)

## Tailwind Theme

The package includes a Tailwind config with AUREV brand tokens. Import it in your app's `tailwind.config.js`:

```js
const aurevTheme = require("@aurev/ui/tailwind");

module.exports = {
  ...aurevTheme,
  // Your app-specific config
};
```

## Typography

- **Font**: Inter / Poppins
- **Icon Set**: lucide-react (peer dependency)

## Version

2.0.0









