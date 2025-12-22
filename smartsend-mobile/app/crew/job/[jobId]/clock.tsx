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
import { router, useLocalSearchParams } from 'expo-router';

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
}

export default function ClockInOutScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [crewMemberId, setCrewMemberId] = useState<string | null>(null);
  const [jobInfo, setJobInfo] = useState<any>(null);

  useEffect(() => {
    fetchCrewMemberId();
    fetchJobInfo();
    checkActiveEntry();
  }, [jobId]);

  const fetchCrewMemberId = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('crew_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (data) {
        setCrewMemberId(data.id);
      }
    } catch (error) {
      console.error('Error fetching crew member:', error);
    }
  };

  const fetchJobInfo = async () => {
    try {
      const { data } = await supabase
        .from('jobs')
        .select('address, homeowner_name, job_type')
        .eq('id', jobId)
        .single();

      if (data) {
        setJobInfo(data);
      }
    } catch (error) {
      console.error('Error fetching job info:', error);
    }
  };

  const checkActiveEntry = async () => {
    if (!crewMemberId) return;

    try {
      const { data, error } = await supabase.rpc('get_active_time_entry', {
        p_job_id: jobId,
        p_crew_member_id: crewMemberId,
      });

      if (data && data.length > 0) {
        setActiveEntry(data[0]);
      }
    } catch (error) {
      console.error('Error checking active entry:', error);
    } finally {
      setLoading(false);
    }
  };

  const clockIn = async () => {
    if (!crewMemberId) {
      Alert.alert('Error', 'Crew member not found. Please contact support.');
      return;
    }

    // Check if checklist is completed
    const { data: checklist } = await supabase
      .from('job_checklists')
      .select('completed')
      .eq('job_id', jobId)
      .eq('checklist_type', 'pre-start')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!checklist || !checklist.completed) {
      Alert.alert(
        'Checklist Required',
        'You must complete the pre-start checklist before clocking in.',
        [
          {
            text: 'Go to Checklist',
            onPress: () => router.push(`/crew/job/${jobId}/checklist`),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    setClocking(true);
    try {
      const { error } = await supabase.from('crew_time_entries').insert({
        job_id: jobId,
        crew_member_id: crewMemberId,
        clock_in: new Date().toISOString(),
      });

      if (error) throw error;

      await checkActiveEntry();
      Alert.alert('Clocked In', 'Time tracking started. Remember to clock out when done.');
    } catch (error) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', 'Failed to clock in. Please try again.');
    } finally {
      setClocking(false);
    }
  };

  const clockOut = async () => {
    if (!activeEntry) return;

    setClocking(true);
    try {
      const { error } = await supabase
        .from('crew_time_entries')
        .update({
          clock_out: new Date().toISOString(),
        })
        .eq('id', activeEntry.id);

      if (error) throw error;

      // Refresh to get updated entry with total hours
      const { data } = await supabase
        .from('crew_time_entries')
        .select('*')
        .eq('id', activeEntry.id)
        .single();

      if (data) {
        setActiveEntry(data);
        Alert.alert(
          'Clocked Out',
          `Total time: ${data.total_hours?.toFixed(2) || '0.00'} hours`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', 'Failed to clock out. Please try again.');
    } finally {
      setClocking(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getElapsedTime = () => {
    if (!activeEntry || !activeEntry.clock_in) return '0:00';
    const start = new Date(activeEntry.clock_in);
    const now = new Date();
    const diff = (now.getTime() - start.getTime()) / 1000 / 60; // minutes
    const hours = Math.floor(diff / 60);
    const minutes = Math.floor(diff % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Time Clock</Text>
      </View>

      <View style={styles.content}>
        {jobInfo && (
          <View style={styles.jobCard}>
            <Text style={styles.jobAddress}>{jobInfo.address}</Text>
            {jobInfo.homeowner_name && (
              <Text style={styles.jobDetail}>Homeowner: {jobInfo.homeowner_name}</Text>
            )}
            {jobInfo.job_type && (
              <Text style={styles.jobDetail}>Type: {jobInfo.job_type}</Text>
            )}
          </View>
        )}

        {activeEntry ? (
          <View style={styles.clockedInContainer}>
            <View style={styles.statusBadge}>
              <MaterialCommunityIcons name="clock-in" size={24} color="#10b981" />
              <Text style={styles.statusText}>CLOCKED IN</Text>
            </View>

            <View style={styles.timeInfo}>
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>Clock In:</Text>
                <Text style={styles.timeValue}>{formatTime(activeEntry.clock_in)}</Text>
              </View>
              {activeEntry.clock_out ? (
                <>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>Clock Out:</Text>
                    <Text style={styles.timeValue}>{formatTime(activeEntry.clock_out)}</Text>
                  </View>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>Total Hours:</Text>
                    <Text style={styles.timeValue}>
                      {activeEntry.total_hours?.toFixed(2) || '0.00'} hrs
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Elapsed Time:</Text>
                  <Text style={styles.elapsedTime}>{getElapsedTime()}</Text>
                </View>
              )}
            </View>

            {!activeEntry.clock_out && (
              <TouchableOpacity
                style={styles.clockOutButton}
                onPress={clockOut}
                disabled={clocking}
              >
                {clocking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="clock-out" size={20} color="#fff" />
                    <Text style={styles.clockOutButtonText}>Clock Out</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.clockedOutContainer}>
            <MaterialCommunityIcons name="clock-outline" size={64} color="#ccc" />
            <Text style={styles.clockedOutText}>Not Clocked In</Text>
            <Text style={styles.clockedOutSubtext}>
              Start tracking your time on this job
            </Text>

            <TouchableOpacity
              style={styles.clockInButton}
              onPress={clockIn}
              disabled={clocking}
            >
              {clocking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="clock-in" size={20} color="#fff" />
                  <Text style={styles.clockInButtonText}>START WORK</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/crew/job/${jobId}/photos`)}
          >
            <MaterialCommunityIcons name="camera" size={20} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Upload Photos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/crew/job/${jobId}/materials`)}
          >
            <MaterialCommunityIcons name="package-variant" size={20} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Verify Materials</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/crew/job/${jobId}/safety`)}
          >
            <MaterialCommunityIcons name="shield-check" size={20} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Safety Log</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/crew/job/${jobId}/issues`)}
          >
            <MaterialCommunityIcons name="alert-circle" size={20} color="#FF6B35" />
            <Text style={styles.actionButtonText}>Report Issue</Text>
          </TouchableOpacity>
        </View>
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
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  content: {
    padding: 16,
  },
  jobCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  jobAddress: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  jobDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  clockedInContainer: {
    backgroundColor: '#F0FDF4',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
  },
  timeInfo: {
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 16,
    color: '#666',
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  elapsedTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
  },
  clockOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  clockOutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  clockedOutContainer: {
    backgroundColor: '#fff',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  clockedOutText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
  },
  clockedOutSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
  clockInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
  clockInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});


























