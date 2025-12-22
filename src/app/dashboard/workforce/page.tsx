"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkforceDashboard } from "@/components/workforce/WorkforceDashboard";
import { HiringPipeline } from "@/components/workforce/HiringPipeline";
import { EmployeeList } from "@/components/workforce/EmployeeList";
import { TrainingModules } from "@/components/workforce/TrainingModules";
import { CertificationsManager } from "@/components/workforce/CertificationsManager";
import { PerformanceLogs } from "@/components/workforce/PerformanceLogs";

export default function WorkforceHubPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Workforce Hub</h1>
        <p className="text-gray-600 mt-1">
          Hiring, Training, Certification, Performance Tracking
        </p>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="hiring">Hiring</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <WorkforceDashboard />
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <EmployeeList />
        </TabsContent>

        <TabsContent value="hiring" className="mt-6">
          <HiringPipeline />
        </TabsContent>

        <TabsContent value="training" className="mt-6">
          <TrainingModules />
        </TabsContent>

        <TabsContent value="certifications" className="mt-6">
          <CertificationsManager />
        </TabsContent>

        <TabsContent value="performance" className="mt-6">
          <PerformanceLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
}
























