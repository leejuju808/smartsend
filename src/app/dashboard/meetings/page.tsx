"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { 
  Calendar, 
  Clock, 
  User, 
  Mail, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Filter,
  Search,
  Download,
  ExternalLink,
  Settings
} from "lucide-react";
import Link from "next/link";

interface Meeting {
  id: string;
  user_id: string;
  lead_id: string;
  campaign_id: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  provider: 'google' | 'outlook' | 'manual' | null;
  external_event_id: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  title: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  lead?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  campaign?: {
    id: string;
    name: string | null;
  };
}

interface MeetingStats {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string | null }[]>([]);
  const [stats, setStats] = useState<MeetingStats>({
    total: 0,
    pending: 0,
    confirmed: 0,
    cancelled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("upcoming");
  const [searchTerm, setSearchTerm] = useState("");
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchCampaigns();
    fetchMeetings();
  }, [statusFilter, campaignFilter, timeFilter]);

  const fetchCampaigns = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select('id, name')
        .order('name', { ascending: true });

      setCampaigns(campaignsData || []);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    }
  };

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch meetings with joined lead and campaign data
      let query = supabase
        .from('meetings')
        .select(`
          *,
          lead:leads(id, email, first_name, last_name),
          campaign:campaigns(id, name)
        `)
        .eq('user_id', user.id)
        .order('start_at', { ascending: timeFilter === 'upcoming' });

      if (statusFilter !== "all") {
        query = query.eq('status', statusFilter);
      }

      if (campaignFilter !== "all") {
        query = query.eq('campaign_id', campaignFilter);
      }

      if (timeFilter === "upcoming") {
        query = query.gte('start_at', new Date().toISOString());
      } else if (timeFilter === "past") {
        query = query.lt('start_at', new Date().toISOString());
      }

      const { data: meetingsData, error: meetingsError } = await query;

      if (meetingsError) throw meetingsError;

      const meetingsWithJoins = (meetingsData || []).map((m: any) => ({
        ...m,
        lead: Array.isArray(m.lead) ? m.lead[0] : m.lead,
        campaign: Array.isArray(m.campaign) ? m.campaign[0] : m.campaign,
      }));

      setMeetings(meetingsWithJoins);

      // Calculate stats
      const total = meetingsWithJoins.length;
      const pending = meetingsWithJoins.filter(m => m.status === 'pending').length;
      const confirmed = meetingsWithJoins.filter(m => m.status === 'confirmed').length;
      const cancelled = meetingsWithJoins.filter(m => m.status === 'cancelled').length;

      setStats({
        total,
        pending,
        confirmed,
        cancelled,
      });

    } catch (err) {
      console.error('Error fetching meetings:', err);
      setError('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  const updateMeetingStatus = async (meetingId: string, newStatus: Meeting['status']) => {
    try {
      const { error } = await supabase
        .from('meetings')
        .update({ status: newStatus })
        .eq('id', meetingId);

      if (error) throw error;

      // Refresh meetings
      await fetchMeetings();
    } catch (err) {
      console.error('Error updating meeting status:', err);
      setError('Failed to update meeting status');
    }
  };

  const getStatusIcon = (status: Meeting['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'confirmed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: Meeting['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredMeetings = meetings.filter(meeting => {
    const matchesSearch = searchTerm === "" || 
      meeting.lead?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (meeting.lead?.first_name && meeting.lead.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (meeting.lead?.last_name && meeting.lead.last_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      meeting.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Meetings</h1>
          <p className="text-gray-600 mt-1">Manage your booked meetings and availability</p>
        </div>
        
        <div className="flex space-x-2">
          <Link
            href="/dashboard/meetings/availability"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center space-x-2"
          >
            <Settings className="h-4 w-4" />
            <span>Availability</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Meetings</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Calendar className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Confirmed</p>
              <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Cancelled</p>
              <p className="text-2xl font-bold text-gray-600">{stats.cancelled}</p>
            </div>
            <XCircle className="h-8 w-8 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by lead name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="flex space-x-2">
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="all">All Time</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name || 'Unnamed Campaign'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Meetings List */}
      <div className="bg-white rounded-lg border">
        {error && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800">{error}</span>
            </div>
          </div>
        )}

        {filteredMeetings.length === 0 ? (
          <div className="p-8 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No meetings found</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== "all" || campaignFilter !== "all"
                ? "Try adjusting your filters or search terms"
                : "Meetings will appear here when leads express intent to meet"
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredMeetings.map((meeting) => {
              const leadName = meeting.lead 
                ? `${meeting.lead.first_name || ''} ${meeting.lead.last_name || ''}`.trim() || meeting.lead.email
                : 'Unknown Lead';
              
              return (
                <div key={meeting.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs border ${getStatusColor(meeting.status)}`}>
                          {getStatusIcon(meeting.status)}
                          <span className="capitalize">{meeting.status}</span>
                        </div>
                        {meeting.campaign && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            {meeting.campaign.name || 'Unnamed Campaign'}
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-medium text-gray-900 mb-1">
                        {meeting.title}
                      </h3>
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <User className="h-4 w-4" />
                          <span>{leadName}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Mail className="h-4 w-4" />
                          <span>{meeting.lead?.email}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>
                            {new Date(meeting.start_at).toLocaleDateString('en-US', { 
                              weekday: 'short',
                              month: 'short', 
                              day: 'numeric',
                              timeZone: meeting.timezone 
                            })} at{' '}
                            {new Date(meeting.start_at).toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              timeZone: meeting.timezone 
                            })}
                          </span>
                        </div>
                        {meeting.location && (
                          <div className="flex items-center space-x-1">
                            <span>📍</span>
                            {meeting.location.startsWith('http') ? (
                              <a href={meeting.location} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                Join Meeting
                              </a>
                            ) : (
                              <span>{meeting.location}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {meeting.notes && (
                        <p className="text-sm text-gray-500 mt-2">{meeting.notes}</p>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {meeting.external_event_id && meeting.provider === 'google' && (
                        <a
                          href={`https://calendar.google.com/calendar/event?eid=${encodeURIComponent(meeting.external_event_id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="Open in Google Calendar"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      
                      {meeting.status === 'pending' && (
                        <div className="flex space-x-1">
                          <button
                            onClick={() => updateMeetingStatus(meeting.id, 'confirmed')}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => updateMeetingStatus(meeting.id, 'cancelled')}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
