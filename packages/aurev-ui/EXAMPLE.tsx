/**
 * Example Usage of @aurev/ui Components
 * 
 * This file demonstrates how to use AUREV 2.0 Design System components
 * across SmartSend, OpsGrid, AgentCloud, and HQ.
 */

import { Button, Card, CardHeader, CardTitle, CardContent, Badge, Layout, Container } from "@aurev/ui";

export function ExampleDashboard() {
  return (
    <Layout variant="dashboard">
      <Container maxWidth="lg">
        {/* Card with Badge */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Welcome to AUREV 2.0</CardTitle>
              <Badge label="New" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 mb-4">
              This is a unified design system with consistent branding across all products.
            </p>
            <div className="flex gap-3">
              <Button variant="primary">Get Started</Button>
              <Button variant="secondary">Learn More</Button>
              <Button variant="outline">View Docs</Button>
            </div>
          </CardContent>
        </Card>

        {/* Button Variants */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Primary Button</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="primary" size="md">
                Primary Action
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secondary Button</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="md">
                Secondary Action
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outline Button</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="md">
                Outline Style
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ghost Button</CardTitle>
            </CardHeader>
            <CardContent>
              <Button variant="ghost" size="md">
                Ghost Style
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Badge Variants */}
        <Card>
          <CardHeader>
            <CardTitle>Badge Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              <Badge label="Default" />
              <Badge variant="gold" label="Gold" />
              <Badge variant="outline" label="Outline" />
            </div>
          </CardContent>
        </Card>
      </Container>
    </Layout>
  );
}

/**
 * Usage in SmartSend App:
 * 
 * Replace:
 *   import { Button } from "@/components/ui/Button";
 * 
 * With:
 *   import { Button } from "@aurev/ui";
 * 
 * And update variant:
 *   <Button variant="default"> → <Button variant="primary">
 */









