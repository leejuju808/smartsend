// Block 238000 — SmartSend Mobile App v1
// Crew Job Flow - Today's Jobs List

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

interface Job {
  id: string;
  lead: {
    name: string;
    address: string;
    phone: string;
  } | null;
  stage: string;
  contractValue: number | null;
  schedule: {
    start_date: string;
    duration_days: number;
  } | null;
  crew: {
    name: string;
  } | null;
}

export default function CrewJobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Try cache first
      const cachedJobs = await getCached<Job[]>(`today_jobs_${user.id}`);
      if (cachedJobs) {
        setJobs(cachedJobs);
        setLoading(false);
      }

      // Fetch from API
      const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://your-api-url.com';
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/api/mobile/jobs/today`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.jobs) {
          setJobs(result.jobs);
          await setCached(`today_jobs_${user.id}`, result.jobs);
        }
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      // Use cached data if available
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const cachedJobs = await getCached<Job[]>(`today_jobs_${user.id}`);
        if (cachedJobs) {
          setJobs(cachedJobs);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'in_progress':
        return '#4ECDC4';
      case 'scheduled':
        return '#45B7D1';
      case 'completed':
        return '#96CEB4';
      default:
        return '#999';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Today's Jobs</Text>
        <Text style={styles.headerSubtitle}>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</Text>
      </View>

      {jobs.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="calendar-blank" size={64} color="#ccc" />
          <Text style={styles.emptyStateText}>No jobs scheduled for today</Text>
        </View>
      ) : (
        <View style={styles.jobsList}>
          {jobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => router.push(`/crew/job/${job.id}`)}
            >
              <View style={styles.jobHeader}>
                <View style={styles.jobInfo}>
                  <Text style={styles.jobAddress}>{job.lead?.address || 'No address'}</Text>
                  <Text style={styles.jobCustomer}>{job.lead?.name || 'Unknown'}</Text>
                </View>
                <View
                  style={[
                    styles.stageBadge,
                    { backgroundColor: getStageColor(job.stage) },
                  ]}
                >
                  <Text style={styles.stageText}>{job.stage.replace('_', ' ')}</Text>
                </View>
              </View>

              {job.contractValue && (
                <View style={styles.jobMeta}>
                  <MaterialCommunityIcons name="cash" size={16} color="#666" />
                  <Text style={styles.jobMetaText}>
                    ${job.contractValue.toLocaleString()}
                  </Text>
                </View>
              )}

              {job.schedule && (
                <View style={styles.jobMeta}>
                  <MaterialCommunityIcons name="calendar-clock" size={16} color="#666" />
                  <Text style={styles.jobMetaText}>
                    {new Date(job.schedule.start_date).toLocaleDateString()} • {job.schedule.duration_days} day{job.schedule.duration_days !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              {job.crew && (
                <View style={styles.jobMeta}>
                  <MaterialCommunityIcons name="account-group" size={16} color="#666" />
                  <Text style={styles.jobMetaText}>{job.crew.name}</Text>
                </View>
              )}

              <View style={styles.jobActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(`/crew/job/${job.id}/clock`)}
                >
                  <MaterialCommunityIcons name="clock-outline" size={20} color="#007AFF" />
                  <Text style={styles.actionBtnText}>Clock In/Out</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(`/crew/job/${job.id}/photos`)}
                >
                  <MaterialCommunityIcons name="camera" size={20} color="#007AFF" />
                  <Text style={styles.actionBtnText}>Photos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push(`/crew/job/${job.id}/safety`)}
                >
                  <MaterialCommunityIcons name="shield-check" size={20} color="#007AFF" />
                  <Text style={styles.actionBtnText}>Safety</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  jobsList: {
    padding: 16,
    gap: 16,
  },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobInfo: {
    flex: 1,
  },
  jobAddress: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  jobCustomer: {
    fontSize: 14,
    color: '#666',
  },
  stageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  stageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  jobMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  jobMetaText: {
    fontSize: 14,
    color: '#666',
  },
  jobActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
});
