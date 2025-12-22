'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Package,
  Shield,
  Users,
  MapPin,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

interface CrewTrackingDashboardProps {
  activeJobs: any[];
  timeEntries: any[];
  checklists: any[];
  materialVerifications: any[];
  recentIssues: any[];
  safetyLogs: any[];
}

export function CrewTrackingDashboard({
  activeJobs,
  timeEntries,
  checklists,
  materialVerifications,
  recentIssues,
  safetyLogs,
}: CrewTrackingDashboardProps) {
  // Calculate metrics
  const activeCrews = new Set(
    activeJobs
      .flatMap((job) => job.job_crew_assignments || [])
      .map((assignment: any) => assignment.crews?.id)
      .filter(Boolean)
  ).size;

  const clockedInCount = timeEntries.filter((entry) => !entry.clock_out).length;
  const completedChecklists = checklists.filter((c) => c.completed).length;
  const missingMaterials = materialVerifications.filter((v) => v.missing).length;
  const highSeverityIssues = recentIssues.filter(
    (issue) => issue.severity === 'high'
  ).length;

  const totalHoursToday = timeEntries.reduce((sum, entry) => {
    return sum + (parseFloat(entry.total_hours) || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Crews</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCrews}</div>
            <p className="text-xs text-muted-foreground">
              {activeJobs.length} active jobs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clocked In</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clockedInCount}</div>
            <p className="text-xs text-muted-foreground">
              {totalHoursToday.toFixed(1)} hours today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checklists Complete</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {completedChecklists}/{checklists.length}
            </div>
            <p className="text-xs text-muted-foreground">Pre-start checklists</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Issues</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentIssues.length}</div>
            <p className="text-xs text-muted-foreground">
              {highSeverityIssues} high/critical
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Active Jobs</TabsTrigger>
          <TabsTrigger value="time">Time Tracking</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="safety">Safety Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Jobs</CardTitle>
              <CardDescription>
                Jobs currently scheduled or in progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeJobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active jobs
                  </div>
                ) : (
                  activeJobs.map((job) => {
                    const crewAssignment = job.job_crew_assignments?.[0];
                    const crew = crewAssignment?.crews;
                    const crewMembers = crew?.crew_members || [];

                    // Get time entries for this job
                    const jobTimeEntries = timeEntries.filter(
                      (entry) => entry.job_id === job.id
                    );
                    const clockedInMembers = jobTimeEntries.filter((e) => !e.clock_out);

                    // Get checklist status
                    const jobChecklist = checklists.find((c) => c.job_id === job.id);

                    return (
                      <div
                        key={job.id}
                        className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Link
                                href={`/production/jobs/${job.id}`}
                                className="font-semibold hover:underline"
                              >
                                {job.address || 'Address TBD'}
                              </Link>
                              <Badge variant="outline">{job.stage}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {job.job_type || 'Install'}
                            </p>
                          </div>
                          {job.contract_value && (
                            <div className="text-right">
                              <p className="text-lg font-semibold">
                                ${Number(job.contract_value).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>

                        {crew && (
                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{crew.name}</span>
                            </div>
                            {crewMembers.length > 0 && (
                              <span className="text-muted-foreground">
                                {crewMembers.length} member{crewMembers.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-4 text-sm">
                          {clockedInMembers.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-green-600" />
                              <span className="text-green-600 font-medium">
                                {clockedInMembers.length} clocked in
                              </span>
                            </div>
                          )}
                          {jobChecklist && (
                            <div className="flex items-center gap-2">
                              {jobChecklist.completed ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  <span className="text-green-600">Checklist complete</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="h-4 w-4 text-orange-600" />
                                  <span className="text-orange-600">Checklist pending</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Time Tracking</CardTitle>
              <CardDescription>Today's clock in/out activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No time entries today
                  </div>
                ) : (
                  timeEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold">
                            {entry.crew_members?.name || 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {entry.jobs?.address || 'Job TBD'}
                          </p>
                          {entry.crew_members?.crews && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {entry.crew_members.crews.name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {entry.clock_out ? (
                            <Badge variant="secondary">Clocked Out</Badge>
                          ) : (
                            <Badge className="bg-green-600">Clocked In</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            In: {new Date(entry.clock_in).toLocaleTimeString()}
                          </span>
                        </div>
                        {entry.clock_out && (
                          <div className="flex items-center gap-1">
                            <span>
                              Out: {new Date(entry.clock_out).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                        {entry.total_hours && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>{parseFloat(entry.total_hours).toFixed(2)} hours</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklists" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pre-Start Checklists</CardTitle>
              <CardDescription>
                Status of required checklists before work begins
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {checklists.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No checklists found
                  </div>
                ) : (
                  checklists.map((checklist) => (
                    <div
                      key={checklist.id}
                      className="border rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <p className="font-semibold">
                          {checklist.jobs?.address || 'Job TBD'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {checklist.checklist_type}
                        </p>
                        {checklist.completed_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Completed: {new Date(checklist.completed_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div>
                        {checklist.completed ? (
                          <Badge className="bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Complete
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Material Verifications</CardTitle>
              <CardDescription>
                Crew verification of delivered materials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {materialVerifications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No material verifications yet
                  </div>
                ) : (
                  materialVerifications.map((verification) => (
                    <div
                      key={verification.id}
                      className="border rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <p className="font-semibold">
                          {verification.jobs?.address || 'Job TBD'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Verified: {new Date(verification.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        {verification.verified ? (
                          <Badge className="bg-green-600">
                            <Package className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : verification.missing ? (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Missing
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Package className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Issues</CardTitle>
              <CardDescription>
                Issues reported by crews that need attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentIssues.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active issues
                  </div>
                ) : (
                  recentIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">
                              {issue.jobs?.address || 'Job TBD'}
                            </p>
                            <Badge
                              variant={
                                issue.severity === 'high'
                                  ? 'destructive'
                                  : issue.severity === 'medium'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {issue.severity}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">
                            {issue.issue_type.replace('_', ' ')}
                          </p>
                          <p className="text-sm mt-2">{issue.description}</p>
                          {issue.crew_members && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Reported by: {issue.crew_members.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(issue.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Safety Logs</CardTitle>
              <CardDescription>
                Today's safety compliance documentation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {safetyLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No safety logs today
                  </div>
                ) : (
                  safetyLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold">
                            {log.jobs?.address || 'Job TBD'}
                          </p>
                          {log.crew_members && (
                            <p className="text-sm text-muted-foreground">
                              Logged by: {log.crew_members.name}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline">
                          <Shield className="h-3 w-3 mr-1" />
                          Safety Log
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {log.weather && (
                          <div>
                            <span className="text-muted-foreground">Weather: </span>
                            <span>{log.weather}</span>
                          </div>
                        )}
                        {log.wind_speed && (
                          <div>
                            <span className="text-muted-foreground">Wind: </span>
                            <span>{log.wind_speed}</span>
                          </div>
                        )}
                      </div>
                      {log.compliance && (
                        <div className="flex items-center gap-4 text-sm">
                          {log.compliance.ppe_used && (
                            <Badge variant="outline" className="text-xs">
                              PPE Used
                            </Badge>
                          )}
                          {log.compliance.ladder_tie_offs && (
                            <Badge variant="outline" className="text-xs">
                              Ladder Tie-Offs
                            </Badge>
                          )}
                          {log.compliance.equipment_checked && (
                            <Badge variant="outline" className="text-xs">
                              Equipment Checked
                            </Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
