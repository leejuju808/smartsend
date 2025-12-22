"use client";

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Mail, Linkedin, Phone } from 'lucide-react';

interface ChannelMessage {
  id: string;
  lead_id: string | null;
  channel: 'email' | 'linkedin' | 'whatsapp';
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  sent_at: string;
  created_at: string;
  lead?: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    company?: string;
  };
}

interface ChannelInboxProps {
  orgId: string;
}

export default function ChannelInbox({ orgId }: ChannelInboxProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'linkedin' | 'whatsapp'>('email');
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ChannelMessage | null>(null);

  const supabase = createClientComponentClient();

  useEffect(() => {
    loadMessages();
  }, [activeTab, orgId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('channel_messages')
        .select(`
          *,
          lead:leads(id, email, phone, name, company)
        `)
        .eq('org_id', orgId)
        .eq('channel', activeTab)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data, error } = await query;

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'linkedin':
        return <Linkedin className="w-4 h-4" />;
      case 'whatsapp':
        return <Phone className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="p-4 border-b">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="email">
              <Mail className="w-4 h-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="linkedin">
              <Linkedin className="w-4 h-4 mr-2" />
              LinkedIn
            </TabsTrigger>
            <TabsTrigger value="whatsapp">
              <Phone className="w-4 h-4 mr-2" />
              WhatsApp
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="email" className="m-0">
          <MessageList messages={messages.filter(m => m.channel === 'email')} onSelect={setSelectedMessage} />
        </TabsContent>

        <TabsContent value="linkedin" className="m-0">
          <MessageList messages={messages.filter(m => m.channel === 'linkedin')} onSelect={setSelectedMessage} />
        </TabsContent>

        <TabsContent value="whatsapp" className="m-0">
          <MessageList messages={messages.filter(m => m.channel === 'whatsapp')} onSelect={setSelectedMessage} />
        </TabsContent>
      </Tabs>

      {selectedMessage && (
        <div className="p-4 border-t">
          <div className="text-sm text-gray-600">
            <div className="font-semibold mb-2">
              {selectedMessage.lead?.name || selectedMessage.lead?.email || selectedMessage.lead?.phone || 'Unknown Contact'}
            </div>
            <div className="mb-2">{selectedMessage.body}</div>
            <div className="text-xs text-gray-400">
              {formatTime(selectedMessage.created_at)} • {selectedMessage.direction} • {selectedMessage.status}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageList({ 
  messages, 
  onSelect 
}: { 
  messages: ChannelMessage[]; 
  onSelect: (msg: ChannelMessage) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No messages found
      </div>
    );
  }

  return (
    <div className="divide-y max-h-[600px] overflow-y-auto">
      {messages.map((message) => (
        <div
          key={message.id}
          onClick={() => onSelect(message)}
          className="p-4 hover:bg-gray-50 cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="font-medium text-sm">
                {message.lead?.name || message.lead?.email || message.lead?.phone || 'Unknown Contact'}
              </div>
              <div className="text-sm text-gray-600 mt-1 truncate">
                {message.body}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(message.created_at).toLocaleString()} • {message.direction}
              </div>
            </div>
            <div className={`text-xs px-2 py-1 rounded ${
              message.direction === 'inbound' 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {message.direction}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

