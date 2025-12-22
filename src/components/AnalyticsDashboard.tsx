import CampaignAnalytics from '@/components/CampaignAnalytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function AnalyticsDashboard() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Campaign Analytics</h1>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="detailed">Detailed</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Standard Analytics Card */}
            <CampaignAnalytics />
            
            {/* Compact Analytics Card */}
            <CampaignAnalytics compact />
            
            {/* Custom Analytics Card */}
            <CampaignAnalytics 
              className="border-blue-200 bg-blue-50" 
              showRefresh={false}
            />
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CampaignAnalytics />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Recent Campaigns</h3>
                  <p className="text-gray-600">
                    View detailed analytics for individual campaigns and compare performance metrics.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CampaignAnalytics />
            <Card>
              <CardHeader>
                <CardTitle>Performance Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-800">Good Performance</h4>
                    <p className="text-green-700 text-sm">
                      Your open rates are above industry average. Keep up the great work!
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <h4 className="font-semibold text-orange-800">Room for Improvement</h4>
                    <p className="text-orange-700 text-sm">
                      Consider A/B testing subject lines to improve open rates.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}