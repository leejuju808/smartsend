import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { router } from 'expo-router';

interface HotLead {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  reply_summary?: any;
  created_at: string;
}

const QUICK_RESPONSES = [
  "We can come today or tomorrow — what works?",
  "What's the full address?",
  "We can stop by around 3 PM — available then?",
  "I'll send you a quick estimate — what's your address?",
  "Perfect timing! When works best for you this week?",
];

export default function HotLeadsScreen() {
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetchHotLeads();
  }, []);

  const fetchHotLeads = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch leads with hot classification
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .or('reply_summary->>classification.eq.HOT,reply_summary->>intent.eq.hot')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching hot leads:', error);
      Alert.alert('Error', 'Failed to load hot leads');
    } finally {
      setLoading(false);
    }
  };

  const sendQuickReply = async (leadId: string, message: string) => {
    setSending(leadId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get lead details
      const { data: lead } = await supabase
        .from('leads')
        .select('email, name')
        .eq('id', leadId)
        .single();

      if (!lead) throw new Error('Lead not found');

      // Send reply via API
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/api/inbox/outbound/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: lead.email,
          subject: `Re: Your roofing inquiry`,
          body: message,
          lead_id: leadId,
        }),
      });

      if (!response.ok) throw new Error('Failed to send reply');

      Alert.alert('Success', 'Reply sent!');
      fetchHotLeads(); // Refresh list
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reply');
    } finally {
      setSending(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="fire" size={32} color="#FF6B6B" />
          <View>
            <Text style={styles.headerTitle}>Hot Leads</Text>
            <Text style={styles.headerSubtitle}>
              {leads.length} lead{leads.length !== 1 ? 's' : ''} need immediate response
            </Text>
          </View>
        </View>
      </View>

      {leads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="fire-off" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No hot leads right now</Text>
          <Text style={styles.emptySubtext}>Check back soon for new opportunities</Text>
        </View>
      ) : (
        <View style={styles.leadsList}>
          {leads.map((lead) => (
            <View key={lead.id} style={styles.leadCard}>
              <View style={styles.leadHeader}>
                <View style={styles.leadInfo}>
                  <Text style={styles.leadName}>{lead.name || lead.email}</Text>
                  <Text style={styles.leadEmail}>{lead.email}</Text>
                  {lead.phone && <Text style={styles.leadPhone}>{lead.phone}</Text>}
                </View>
                <View style={styles.timeBadge}>
                  <Text style={styles.timeText}>{formatDate(lead.created_at)}</Text>
                </View>
              </View>

              <View style={styles.quickResponsesContainer}>
                <Text style={styles.quickResponsesTitle}>Quick Responses:</Text>
                {QUICK_RESPONSES.map((response, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.quickResponseButton,
                      sending === lead.id && styles.quickResponseButtonDisabled,
                    ]}
                    onPress={() => sendQuickReply(lead.id, response)}
                    disabled={sending === lead.id}
                  >
                    {sending === lead.id ? (
                      <ActivityIndicator size="small" color="#007AFF" />
                    ) : (
                      <>
                        <Text style={styles.quickResponseText}>{response}</Text>
                        <MaterialCommunityIcons name="send" size={18} color="#007AFF" />
                      </>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.viewDetailsButton}
                onPress={() => router.push(`/lead/${lead.id}`)}
              >
                <Text style={styles.viewDetailsText}>View Full Details</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
  leadsList: {
    padding: 16,
    gap: 16,
  },
  leadCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  leadEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  leadPhone: {
    fontSize: 14,
    color: '#666',
  },
  timeBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F57C00',
  },
  quickResponsesContainer: {
    marginBottom: 16,
  },
  quickResponsesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  quickResponseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  quickResponseButtonDisabled: {
    opacity: 0.6,
  },
  quickResponseText: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    marginRight: 8,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginRight: 4,
  },
});


























