"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@supabase/supabase-js";
import { TrendingUp, Clock, MapPin } from "lucide-react";

interface BehaviorGraphsProps {
  workspaceId: string;
  zipcode?: string;
}

export function BehaviorGraphs({ workspaceId, zipcode }: BehaviorGraphsProps) {
  const [opensByHour, setOpensByHour] = useState<any[]>([]);
  const [repliesByHour, setRepliesByHour] = useState<any[]>([]);
  const [opensByDay, setOpensByDay] = useState<any[]>([]);
  const [repliesByDay, setRepliesByDay] = useState<any[]>([]);
  const [zipcodePerformance, setZipcodePerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBehaviorData();
  }, [workspaceId, zipcode]);

  const loadBehaviorData = async () => {
    setLoading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      let query = supabase
        .from("open_behavior")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("sends", 5); // Minimum data threshold

      if (zipcode) {
        query = query.eq("zipcode", zipcode);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process data for charts
      const hourData: Record<number, { opens: number; replies: number; sends: number }> = {};
      const dayData: Record<number, { opens: number; replies: number; sends: number }> = {};

      data?.forEach((row) => {
        // By hour
        if (!hourData[row.hour]) {
          hourData[row.hour] = { opens: 0, replies: 0, sends: 0 };
        }
        hourData[row.hour].opens += row.opens;
        hourData[row.hour].replies += row.replies;
        hourData[row.hour].sends += row.sends;

        // By day
        if (!dayData[row.day_of_week]) {
          dayData[row.day_of_week] = { opens: 0, replies: 0, sends: 0 };
        }
        dayData[row.day_of_week].opens += row.opens;
        dayData[row.day_of_week].replies += row.replies;
        dayData[row.day_of_week].sends += row.sends;
      });

      // Convert to arrays
      setOpensByHour(
        Object.entries(hourData)
          .map(([hour, data]) => ({
            hour: parseInt(hour),
            openRate: data.sends > 0 ? data.opens / data.sends : 0,
            replyRate: data.sends > 0 ? data.replies / data.sends : 0,
            sends: data.sends,
          }))
          .sort((a, b) => a.hour - b.hour)
      );

      setRepliesByHour(
        Object.entries(hourData)
          .map(([hour, data]) => ({
            hour: parseInt(hour),
            replyRate: data.sends > 0 ? data.replies / data.sends : 0,
            sends: data.sends,
          }))
          .sort((a, b) => a.hour - b.hour)
      );

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      setOpensByDay(
        Object.entries(dayData)
          .map(([day, data]) => ({
            day: parseInt(day),
            dayName: dayNames[parseInt(day)],
            openRate: data.sends > 0 ? data.opens / data.sends : 0,
            sends: data.sends,
          }))
          .sort((a, b) => a.day - b.day)
      );

      setRepliesByDay(
        Object.entries(dayData)
          .map(([day, data]) => ({
            day: parseInt(day),
            dayName: dayNames[parseInt(day)],
            replyRate: data.sends > 0 ? data.replies / data.sends : 0,
            sends: data.sends,
          }))
          .sort((a, b) => a.day - b.day)
      );

      // ZIP code performance
      const zipData: Record<string, { opens: number; replies: number; sends: number }> = {};
      data?.forEach((row) => {
        if (!row.zipcode) return;
        if (!zipData[row.zipcode]) {
          zipData[row.zipcode] = { opens: 0, replies: 0, sends: 0 };
        }
        zipData[row.zipcode].opens += row.opens;
        zipData[row.zipcode].replies += row.replies;
        zipData[row.zipcode].sends += row.sends;
      });

      setZipcodePerformance(
        Object.entries(zipData)
          .map(([zip, data]) => ({
            zipcode: zip,
            openRate: data.sends > 0 ? data.opens / data.sends : 0,
            replyRate: data.sends > 0 ? data.replies / data.sends : 0,
            sends: data.sends,
          }))
          .sort((a, b) => b.openRate - a.openRate)
          .slice(0, 10)
      );
    } catch (error) {
      console.error("Error loading behavior data:", error);
    } finally {
      setLoading(false);
    }
  };

  const maxValue = (data: any[], key: string) => {
    return Math.max(...data.map((d) => d[key] || 0), 0.1);
  };

  if (loading) {
    return <div className="text-center p-6">Loading behavior data...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="opens-by-hour">
        <TabsList>
          <TabsTrigger value="opens-by-hour">Opens by Hour</TabsTrigger>
          <TabsTrigger value="replies-by-hour">Replies by Hour</TabsTrigger>
          <TabsTrigger value="opens-by-day">Opens by Day</TabsTrigger>
          <TabsTrigger value="replies-by-day">Replies by Day</TabsTrigger>
          <TabsTrigger value="zipcodes">ZIP Code Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="opens-by-hour">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Opens by Hour
              </CardTitle>
              <CardDescription>
                When are your emails most likely to be opened?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {opensByHour.map((item) => {
                  const max = maxValue(opensByHour, "openRate");
                  const width = (item.openRate / max) * 100;
                  return (
                    <div key={item.hour} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.hour}:00</span>
                        <span className="font-medium">
                          {Math.round(item.openRate * 100)}% ({item.sends} sends)
                        </span>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="replies-by-hour">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Replies by Hour
              </CardTitle>
              <CardDescription>
                When are your emails most likely to get replies?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {repliesByHour.map((item) => {
                  const max = maxValue(repliesByHour, "replyRate");
                  const width = (item.replyRate / max) * 100;
                  return (
                    <div key={item.hour} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.hour}:00</span>
                        <span className="font-medium">
                          {Math.round(item.replyRate * 100)}% ({item.sends} sends)
                        </span>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opens-by-day">
          <Card>
            <CardHeader>
              <CardTitle>Opens by Day of Week</CardTitle>
              <CardDescription>
                Which days perform best for opens?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {opensByDay.map((item) => {
                  const max = maxValue(opensByDay, "openRate");
                  const width = (item.openRate / max) * 100;
                  return (
                    <div key={item.day} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.dayName}</span>
                        <span className="font-medium">
                          {Math.round(item.openRate * 100)}% ({item.sends} sends)
                        </span>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="replies-by-day">
          <Card>
            <CardHeader>
              <CardTitle>Replies by Day of Week</CardTitle>
              <CardDescription>
                Which days perform best for replies?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {repliesByDay.map((item) => {
                  const max = maxValue(repliesByDay, "replyRate");
                  const width = (item.replyRate / max) * 100;
                  return (
                    <div key={item.day} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{item.dayName}</span>
                        <span className="font-medium">
                          {Math.round(item.replyRate * 100)}% ({item.sends} sends)
                        </span>
                      </div>
                      <div className="h-4 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="zipcodes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                ZIP Code Performance
              </CardTitle>
              <CardDescription>
                Top performing ZIP codes by engagement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {zipcodePerformance.map((item) => (
                  <div
                    key={item.zipcode}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <div className="font-medium">{item.zipcode}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.sends} sends
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {Math.round(item.openRate * 100)}% open
                      </div>
                      <div className="text-sm text-green-600">
                        {Math.round(item.replyRate * 100)}% reply
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



























