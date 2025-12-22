"use client";
import { useState, useEffect } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ResponsiveContainer, 
  BarChart, 
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Download, Calendar, Filter, RefreshCw, TrendingUp, Users, Mail, MousePointer } from "lucide-react";

interface ReportData {
  total_events: number;
  by_type: Record<string, number>;
  by_source: Record<string, number>;
  events: any[];
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState("30d");
  const [sourceType, setSourceType] = useState("all");

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange !== "all") {
        const end = new Date();
        const start = new Date();
        if (dateRange === "7d") start.setDate(start.getDate() - 7);
        else if (dateRange === "30d") start.setDate(start.getDate() - 30);
        else if (dateRange === "90d") start.setDate(start.getDate() - 90);
        
        params.append("start", start.toISOString());
        params.append("end", end.toISOString());
      }
      if (sourceType !== "all") {
        params.append("sourceType", sourceType);
      }

      const response = await fetch(`/api/reports/summary?${params.toString()}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to load reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange, sourceType]);

  // Transform data for charts
  const getChartData = () => {
    if (!data?.events) return [];
    
    const grouped = data.events.reduce((acc: any, event: any) => {
      const day = new Date(event.created_at).toLocaleDateString();
      if (!acc[day]) {
        acc[day] = { day, opens: 0, clicks: 0, replies: 0, sent: 0 };
      }
      
      if (event.type === "open") acc[day].opens++;
      else if (event.type === "click") acc[day].clicks++;
      else if (event.type === "reply") acc[day].replies++;
      else if (event.type === "sent") acc[day].sent++;
      
      return acc;
    }, {});
    
    return Object.values(grouped).sort((a: any, b: any) => 
      new Date(a.day).getTime() - new Date(b.day).getTime()
    );
  };

  const getSourceData = () => {
    if (!data?.by_source) return [];
    return Object.entries(data.by_source).map(([source, count]) => ({
      name: source.charAt(0).toUpperCase() + source.slice(1),
      value: count
    }));
  };

  const getTypeData = () => {
    if (!data?.by_type) return [];
    return Object.entries(data.by_type).map(([type, count]) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: count
    }));
  };

  const chartData = getChartData();
  const sourceData = getSourceData();
  const typeData = getTypeData();

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics & Reports</h1>
          <p className="text-lg text-gray-600 mt-2">
            Track engagement, measure performance, and export data for deeper analysis
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Loading..." : "Refresh"}
          </button>
          <a
            href={`/api/reports/summary?format=csv&start=${dateRange !== "all" ? new Date(Date.now() - (dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString() : ""}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <a
            href="/dashboard/reports"
            className="border-b-2 border-black py-2 px-1 text-sm font-medium text-gray-900"
          >
            Analytics
          </a>
          <a
            href="/dashboard/reports/insights"
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
          >
            AI Insights
          </a>
        </nav>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="all">All sources</option>
              <option value="campaign">Campaigns only</option>
              <option value="sequence">Sequences only</option>
              <option value="reply">Replies only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Events</p>
              <p className="text-2xl font-bold text-gray-900">{data?.total_events || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Opens</p>
              <p className="text-2xl font-bold text-gray-900">{data?.by_type?.open || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MousePointer className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Clicks</p>
              <p className="text-2xl font-bold text-gray-900">{data?.by_type?.click || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Users className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Replies</p>
              <p className="text-2xl font-bold text-gray-900">{data?.by_type?.reply || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Over Time */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Engagement Over Time</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="opens" stroke="#3B82F6" strokeWidth={2} />
                <Line type="monotone" dataKey="clicks" stroke="#8B5CF6" strokeWidth={2} />
                <Line type="monotone" dataKey="replies" stroke="#F59E0B" strokeWidth={2} />
                <Line type="monotone" dataKey="sent" stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Event Types Distribution */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Event Types</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Source Distribution */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Source Distribution</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Events Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Events</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Campaign/Sequence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Event Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.events?.slice(0, 10).map((event, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      event.source_type === 'campaign' ? 'bg-blue-100 text-blue-800' :
                      event.source_type === 'sequence' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {event.source_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {event.campaign_title || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {event.recipient_email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      event.type === 'open' ? 'bg-green-100 text-green-800' :
                      event.type === 'click' ? 'bg-blue-100 text-blue-800' :
                      event.type === 'reply' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {event.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(event.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
} 