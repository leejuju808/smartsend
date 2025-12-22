"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Calendar, Link, CheckCircle, AlertCircle, Settings, ExternalLink } from "lucide-react";

interface CalendlySettings {
  calendly_url: string;
  default_duration: number;
  meeting_type: string;
  timezone: string;
  is_connected: boolean;
}

export default function CalendlySettingsPage() {
  const [settings, setSettings] = useState<CalendlySettings>({
    calendly_url: "",
    default_duration: 30,
    meeting_type: "intro_call",
    timezone: "America/New_York",
    is_connected: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('calendly_url, calendly_settings')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const calendlySettings = data.calendly_settings || {};
        setSettings({
          calendly_url: data.calendly_url || "",
          default_duration: calendlySettings.default_duration || 30,
          meeting_type: calendlySettings.meeting_type || "intro_call",
          timezone: calendlySettings.timezone || "America/New_York",
          is_connected: !!data.calendly_url
        });
      }
    } catch (err) {
      console.error('Error fetching Calendly settings:', err);
      setError('Failed to load Calendly settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const { data: user } = await supabase.auth.getUser();
      if (!user) return;

      // Validate Calendly URL format
      if (settings.calendly_url && !settings.calendly_url.includes('calendly.com')) {
        setError('Please enter a valid Calendly URL (e.g., https://calendly.com/your-username)');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          calendly_url: settings.calendly_url,
          calendly_settings: {
            default_duration: settings.default_duration,
            meeting_type: settings.meeting_type,
            timezone: settings.timezone
          }
        })
        .eq('id', user.id);

      if (error) throw error;

      setSuccess('Calendly settings saved successfully!');
      setSettings(prev => ({ ...prev, is_connected: !!settings.calendly_url }));
    } catch (err) {
      console.error('Error saving Calendly settings:', err);
      setError('Failed to save Calendly settings');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!settings.calendly_url) {
      setError('Please enter a Calendly URL first');
      return;
    }

    try {
      // Test the Calendly URL by making a request
      const response = await fetch(`/api/calendly/test?url=${encodeURIComponent(settings.calendly_url)}`);
      const result = await response.json();
      
      if (result.success) {
        setSuccess('Calendly connection successful!');
      } else {
        setError('Failed to connect to Calendly. Please check your URL.');
      }
    } catch (err) {
      setError('Failed to test Calendly connection');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded w-32"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Calendly Integration</h1>
        <p className="text-gray-600 mt-1">
          Connect your Calendly account to automatically book meetings from reply intents
        </p>
      </div>

      {/* Connection Status */}
      <div className={`rounded-lg p-4 border ${
        settings.is_connected 
          ? 'bg-green-50 border-green-200' 
          : 'bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-center space-x-2">
          {settings.is_connected ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-yellow-600" />
          )}
          <span className={`font-medium ${
            settings.is_connected ? 'text-green-800' : 'text-yellow-800'
          }`}>
            {settings.is_connected ? 'Calendly Connected' : 'Calendly Not Connected'}
          </span>
        </div>
        <p className={`text-sm mt-1 ${
          settings.is_connected ? 'text-green-700' : 'text-yellow-700'
        }`}>
          {settings.is_connected 
            ? 'Reply intents will automatically generate Calendly links and ICS invites'
            : 'Connect your Calendly account to enable automatic meeting booking'
          }
        </p>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h2 className="text-xl font-semibold text-gray-900">Calendly Settings</h2>
        
        {/* Calendly URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Calendly URL
          </label>
          <div className="flex space-x-2">
            <input
              type="url"
              value={settings.calendly_url}
              onChange={(e) => setSettings(prev => ({ ...prev, calendly_url: e.target.value }))}
              placeholder="https://calendly.com/your-username"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={testConnection}
              disabled={!settings.calendly_url}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Test
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Enter your public Calendly URL (e.g., https://calendly.com/your-username)
          </p>
        </div>

        {/* Meeting Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Duration (minutes)
            </label>
            <select
              value={settings.default_duration}
              onChange={(e) => setSettings(prev => ({ ...prev, default_duration: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Type
            </label>
            <select
              value={settings.meeting_type}
              onChange={(e) => setSettings(prev => ({ ...prev, meeting_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="intro_call">Intro Call</option>
              <option value="consultation">Consultation</option>
              <option value="demo">Demo</option>
              <option value="discovery">Discovery Call</option>
            </select>
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timezone
          </label>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Chicago">Central Time (CT)</option>
            <option value="America/Denver">Mountain Time (MT)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-800">{success}</span>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h3>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">1</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Reply Intent Detection</h4>
              <p className="text-sm text-gray-600">
                SmartSend analyzes incoming replies to detect meeting intent with high confidence
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">2</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Automatic Response</h4>
              <p className="text-sm text-gray-600">
                When meeting intent is detected, we automatically reply with your Calendly link and ICS attachment
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">3</span>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Meeting Tracking</h4>
              <p className="text-sm text-gray-600">
                All meetings are tracked in your dashboard with MB/100 metrics for optimization
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="https://calendly.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Calendar className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium">Calendly Dashboard</div>
              <div className="text-sm text-gray-600">Manage your Calendly account</div>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
          </a>
          
          <a
            href="/dashboard/analytics"
            className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium">Analytics Dashboard</div>
              <div className="text-sm text-gray-600">View MB/100 and meeting metrics</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}