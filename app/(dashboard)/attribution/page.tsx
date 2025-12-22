/**
 * Block 93000 — Lead Attribution Dashboard
 * Shows source performance, ROI, and revenue attribution
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttributionDashboard } from "./_components/AttributionDashboard";
import { CampaignPerformanceTable } from "./_components/CampaignPerformanceTable";
import { QRCodeManager } from "./_components/QRCodeManager";

export default function AttributionPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Lead Attribution</h1>
        <p className="text-lg text-gray-600 mt-2">
          Track where every lead comes from and which channels produce revenue
        </p>
      </div>

      <Tabs defaultValue="sources" className="space-y-6">
        <TabsList>
          <TabsTrigger value="sources">Source Performance</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="qr-codes">QR Codes</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <AttributionDashboard />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignPerformanceTable />
        </TabsContent>

        <TabsContent value="qr-codes">
          <QRCodeManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}



























