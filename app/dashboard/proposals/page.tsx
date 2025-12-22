// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Contractor Dashboard: Proposal Pipeline & Analytics

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProposalPipeline } from "./components/ProposalPipeline";
import { ProposalAnalytics } from "./components/ProposalAnalytics";
import { ProposalTemplateManager } from "./components/ProposalTemplateManager";
import Link from "next/link";

export default function ProposalsDashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Proposals</h1>
          <p className="text-gray-600 mt-1">
            Manage your roofing proposals, track homeowner engagement, and close more deals
          </p>
        </div>
        <Link href="/dashboard/proposals/new">
          <Button>Create New Proposal</Button>
        </Link>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <ProposalPipeline />
        </TabsContent>

        <TabsContent value="analytics">
          <ProposalAnalytics />
        </TabsContent>

        <TabsContent value="templates">
          <ProposalTemplateManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
