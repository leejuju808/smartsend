// Block 238000 — SmartSend Mobile App v1
// Enhanced Home Screen with Role-Based Navigation

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { router } from 'expo-router';
import { getCached, setCached } from '@/lib/cache';
import { getQueueStatus } from '@/lib/offlineQueue';

type UserRole = 'crew' | 'sales' | 'manager' | 'owner' | null;

interface HomeData {
  role: UserRole;
  todayJobs: number;
  myLeads: number;
  activeJobs: number;
  serviceTickets: number;
  tasks: number;
  messages: number;
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData>({
    role: null,
    todayJobs: 0,
    myLeads: 0,
    activeJobs: 0,
    serviceTickets: 0,
    tasks: 0,
    messages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [queueStatus, setQueueStatus] = useState({ pending: 0, failed: 0 });
  const [userName, setUserName] = useState('');

  const detectUserRole = async (userId: string): Promise<UserRole> => {
    // Check if user is a crew member
    const { data: crewMember } = await supabase
      .from('crew_members')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (crewMember) return 'crew';

    // Check if user is a manager/owner (has workspace admin role)
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (membership?.role === 'owner' || membership?.role === 'admin') {
      return membership.role === 'owner' ? 'owner' : 'manager';
    }

    // Default to sales if they have leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (leads && leads.length > 0) return 'sales';

    return 'sales'; // Default
  };

  const fetchHomeData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (profile?.full_name) {
        setUserName(profile.full_name);
      }

      // Detect role
      const role = await detectUserRole(user.id);
      setData((prev) => ({ ...prev, role }));

      // Try to load from cache first
      const cachedData = await getCached<HomeData>(`home_${user.id}`);
      if (cachedData) {
        setData({ ...cachedData, role });
        setLoading(false);
      }

      // Fetch today's jobs (for crew)
      if (role === 'crew' || role === 'manager' || role === 'owner') {
        const today = new Date().toISOString().split('T')[0];
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id', { count: 'exact' })
          .or('stage.eq.in_progress,stage.eq.scheduled')
          .gte('created_at', new Date(today).toISOString());

        setData((prev) => ({
          ...prev,
          todayJobs: jobsData?.length || 0,
        }));
      }

      // Fetch my leads (for sales)
      if (role === 'sales' || role === 'manager' || role === 'owner') {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id);

        setData((prev) => ({
          ...prev,
          myLeads: leadsData?.length || 0,
        }));
      }

      // Fetch active jobs (for manager/owner)
      if (role === 'manager' || role === 'owner') {
        const { data: activeJobsData } = await supabase
          .from('jobs')
          .select('id', { count: 'exact' })
          .in('stage', ['scheduled', 'in_progress']);

        setData((prev) => ({
          ...prev,
          activeJobs: activeJobsData?.length || 0,
        }));
      }

      // Fetch service tickets
      const { data: ticketsData } = await supabase
        .from('service_tickets')
        .select('id', { count: 'exact' })
        .in('status', ['open', 'assigned', 'in_progress']);

      setData((prev) => ({
        ...prev,
        serviceTickets: ticketsData?.length || 0,
      }));

      // Fetch tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id', { count: 'exact' })
        .eq('assigned_to', user.id)
        .eq('status', 'open');

      setData((prev) => ({
        ...prev,
        tasks: tasksData?.length || 0,
      }));

      // Fetch unread messages
      const { data: messagesData } = await supabase
        .from('messages')
        .select('id', { count: 'exact' })
        .eq('recipient_id', user.id)
        .eq('read', false);

      setData((prev) => ({
        ...prev,
        messages: messagesData?.length || 0,
      }));

      // Cache the data
      await setCached(`home_${user.id}`, data);

      // Get queue status
      const queue = await getQueueStatus();
      setQueueStatus(queue);
    } catch (error) {
      console.error('Error fetching home data:', error);
      // If online fetch fails, try to use cached data
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const cachedData = await getCached<HomeData>(`home_${user.id}`);
        if (cachedData) {
          setData(cachedData);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHomeData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHomeData();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const { role } = data;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}, {userName || 'there'}</Text>
          <Text style={styles.headerSubtitle}>
            {role === 'crew' && 'Crew Member'}
            {role === 'sales' && 'Sales Rep'}
            {role === 'manager' && 'Production Manager'}
            {role === 'owner' && 'Owner'}
          </Text>
        </View>
        {queueStatus.pending > 0 && (
          <View style={styles.queueBadge}>
            <MaterialCommunityIcons name="cloud-upload" size={16} color="#fff" />
            <Text style={styles.queueBadgeText}>{queueStatus.pending}</Text>
          </View>
        )}
      </View>

      {/* Role-Based Cards */}
      <View style={styles.cardsContainer}>
        {/* Crew Cards */}
        {(role === 'crew' || role === 'manager' || role === 'owner') && (
          <>
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push('/(tabs)/crew')}
            >
              <MaterialCommunityIcons name="hard-hat" size={32} color="#007AFF" />
              <Text style={styles.cardValue}>{data.todayJobs}</Text>
              <Text style={styles.cardLabel}>Today's Jobs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push('/service')}
            >
              <MaterialCommunityIcons name="wrench" size={32} color="#FF6B6B" />
              <Text style={styles.cardValue}>{data.serviceTickets}</Text>
              <Text style={styles.cardLabel}>Service Jobs</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Sales Cards */}
        {(role === 'sales' || role === 'manager' || role === 'owner') && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/(tabs)/leads')}
          >
            <MaterialCommunityIcons name="fire" size={32} color="#FF6B6B" />
            <Text style={styles.cardValue}>{data.myLeads}</Text>
            <Text style={styles.cardLabel}>My Leads</Text>
          </TouchableOpacity>
        )}

        {/* Manager/Owner Cards */}
        {(role === 'manager' || role === 'owner') && (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/manager/jobs')}
          >
            <MaterialCommunityIcons name="view-dashboard" size={32} color="#4ECDC4" />
            <Text style={styles.cardValue}>{data.activeJobs}</Text>
            <Text style={styles.cardLabel}>Active Jobs</Text>
          </TouchableOpacity>
        )}

        {/* Common Cards */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/messages')}
        >
          <MaterialCommunityIcons name="message-text" size={32} color="#45B7D1" />
          <Text style={styles.cardValue}>{data.messages}</Text>
          <Text style={styles.cardLabel}>Messages</Text>
          {data.messages > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{data.messages}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/tasks')}
        >
          <MaterialCommunityIcons name="check-circle" size={32} color="#96CEB4" />
          <Text style={styles.cardValue}>{data.tasks}</Text>
          <Text style={styles.cardLabel}>Tasks</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        {(role === 'crew' || role === 'manager' || role === 'owner') && (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/crew/job/new')}
            >
              <MaterialCommunityIcons name="plus-circle" size={24} color="#007AFF" />
              <Text style={styles.actionButtonText}>Start Job</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/upload-photos')}
            >
              <MaterialCommunityIcons name="camera" size={24} color="#007AFF" />
              <Text style={styles.actionButtonText}>Upload Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/safety/checklist')}
            >
              <MaterialCommunityIcons name="shield-check" size={24} color="#007AFF" />
              <Text style={styles.actionButtonText}>Safety Checklist</Text>
            </TouchableOpacity>
          </>
        )}

        {(role === 'sales' || role === 'manager' || role === 'owner') && (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/sales/new-lead')}
            >
              <MaterialCommunityIcons name="account-plus" size={24} color="#007AFF" />
              <Text style={styles.actionButtonText}>New Lead</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/sales/estimate')}
            >
              <MaterialCommunityIcons name="file-document-edit" size={24} color="#007AFF" />
              <Text style={styles.actionButtonText}>Create Estimate</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/notifications')}
        >
          <MaterialCommunityIcons name="bell" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>Notifications</Text>
        </TouchableOpacity>
      </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  queueBadge: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  queueBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    width: '47%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  cardValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 8,
  },
  cardLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
