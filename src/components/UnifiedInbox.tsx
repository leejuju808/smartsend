"use client";

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@/lib/supabase';
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  Calendar, 
  Clock, 
  User, 
  Building,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface Conversation {
  id: string;
  contact: {
    id: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    phone?: string;
    email?: string;
  };
  conversation_type: 'sms' | 'call' | 'email';
  status: 'active' | 'completed' | 'escalated' | 'cancelled';
  meeting_booked: boolean;
  meeting_datetime?: string;
  industry: string;
  created_at: string;
  updated_at: string;
  last_message?: {
    content: string;
    message_type: 'inbound' | 'outbound' | 'ai_generated';
    created_at: string;
  };
}

interface UnifiedInboxProps {
  userId: string;
}

export default function UnifiedInbox({ userId }: UnifiedInboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sms' | 'call' | 'email'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'escalated'>('all');

  const supabase = createClientComponentClient();

  useEffect(() => {
    loadConversations();
  }, [userId, filter, statusFilter]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('ai_conversations')
        .select(`
          *,
          contact:contacts(id, first_name, last_name, company, phone, email),
          last_message:ai_conversation_messages(content, message_type, created_at)
        `)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('conversation_type', filter);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get the last message for each conversation
      const conversationsWithLastMessage = await Promise.all(
        (data || []).map(async (conv) => {
          const { data: lastMessage } = await supabase
            .from('ai_conversation_messages')
            .select('content, message_type, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...conv,
            last_message: lastMessage
          };
        })
      );

      setConversations(conversationsWithLastMessage);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_conversation_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const getConversationIcon = (type: string) => {
    switch (type) {
      case 'sms': return <MessageSquare className="w-4 h-4" />;
      case 'call': return <Phone className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Clock className="w-4 h-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'escalated': return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
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

  const getContactName = (contact: any) => {
    if (contact.first_name || contact.last_name) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    }
    return contact.company || contact.phone || contact.email || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] bg-white rounded-lg shadow-sm border">
      {/* Conversations List */}
      <div className="w-1/3 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Unified Inbox</h2>
          
          {/* Filters */}
          <div className="mt-4 space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="mt-1 block w-full text-sm border-gray-300 rounded-md"
              >
                <option value="all">All</option>
                <option value="sms">SMS</option>
                <option value="call">Calls</option>
                <option value="email">Email</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="mt-1 block w-full text-sm border-gray-300 rounded-md"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No conversations found
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-200' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {getConversationIcon(conversation.conversation_type)}
                    <div>
                      <div className="font-medium text-gray-900">
                        {getContactName(conversation.contact)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {conversation.contact.company && (
                          <span className="flex items-center">
                            <Building className="w-3 h-3 mr-1" />
                            {conversation.contact.company}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(conversation.status)}
                    {conversation.meeting_booked && (
                      <Calendar className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </div>
                
                {conversation.last_message && (
                  <div className="mt-2">
                    <div className="text-sm text-gray-600 truncate">
                      {conversation.last_message.content}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {formatTime(conversation.last_message.created_at)}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages View */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">
                    {getContactName(selectedConversation.contact)}
                  </h3>
                  <div className="text-sm text-gray-500">
                    {selectedConversation.contact.phone && (
                      <span>{selectedConversation.contact.phone}</span>
                    )}
                    {selectedConversation.contact.email && (
                      <span className="ml-2">{selectedConversation.contact.email}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {getConversationIcon(selectedConversation.conversation_type)}
                  {getStatusIcon(selectedConversation.status)}
                  {selectedConversation.meeting_booked && (
                    <div className="flex items-center text-green-600">
                      <Calendar className="w-4 h-4 mr-1" />
                      <span className="text-sm">Meeting Booked</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No messages yet
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.message_type === 'inbound' ? 'justify-start' : 'justify-end'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.message_type === 'inbound'
                          ? 'bg-gray-100 text-gray-900'
                          : message.message_type === 'ai_generated'
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      <div className="text-sm">{message.content}</div>
                      <div className="text-xs mt-1 opacity-70">
                        {formatTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a conversation to view messages
          </div>
        )}
      </div>
    </div>
  );
}