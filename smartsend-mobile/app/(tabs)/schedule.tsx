import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { router } from 'expo-router';

interface Appointment {
  id: string;
  date: string;
  time: string;
  homeowner_name: string;
  homeowner_address: string;
  notes?: string;
  appointment_type?: string;
}

export default function ScheduleScreen() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodayAppointments();
  }, []);

  const fetchTodayAppointments = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('status', 'scheduled')
        .order('time', { ascending: true });

      if (error) throw error;

      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const openInMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.apple.com/?q=${encodedAddress}`;
    Linking.openURL(url).catch((err) => console.error('Error opening maps:', err));
  };

  const formatTime = (time: string) => {
    // Handle both "HH:MM:SS" and "HH:MM" formats
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getAppointmentTypeLabel = (type?: string) => {
    if (!type) return 'Appointment';
    const labels: Record<string, string> = {
      roof_inspection: 'Roof Inspection',
      leak_check: 'Leak Check',
      full_roof_estimate: 'Full Roof Estimate',
      insurance_inspection: 'Insurance Inspection',
      storm_damage_assessment: 'Storm Damage Assessment',
      gutter_roof_check: 'Gutter & Roof Check',
    };
    return labels[type] || type;
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
        <Text style={styles.headerTitle}>Today's Schedule</Text>
        <Text style={styles.headerSubtitle}>
          {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} today
        </Text>
      </View>

      {appointments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="calendar-blank" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No appointments scheduled for today</Text>
        </View>
      ) : (
        <View style={styles.appointmentsList}>
          {appointments.map((appointment) => (
            <TouchableOpacity
              key={appointment.id}
              style={styles.appointmentCard}
              onPress={() => router.push(`/appointment/${appointment.id}`)}
            >
              <View style={styles.appointmentHeader}>
                <View style={styles.timeContainer}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color="#007AFF" />
                  <Text style={styles.timeText}>{formatTime(appointment.time)}</Text>
                </View>
                {appointment.appointment_type && (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>
                      {getAppointmentTypeLabel(appointment.appointment_type)}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.homeownerName}>{appointment.homeowner_name}</Text>
              {appointment.homeowner_address && (
                <View style={styles.addressContainer}>
                  <MaterialCommunityIcons name="map-marker" size={16} color="#666" />
                  <Text style={styles.addressText}>{appointment.homeowner_address}</Text>
                </View>
              )}

              {appointment.notes && (
                <Text style={styles.notesText} numberOfLines={2}>
                  {appointment.notes}
                </Text>
              )}

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openInMaps(appointment.homeowner_address || '')}
                >
                  <MaterialCommunityIcons name="map" size={18} color="#007AFF" />
                  <Text style={styles.actionButtonText}>Open in Maps</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push(`/appointment/${appointment.id}/workflow`)}
                >
                  <MaterialCommunityIcons name="play-circle" size={18} color="#007AFF" />
                  <Text style={styles.actionButtonText}>Start Workflow</Text>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  appointmentsList: {
    padding: 16,
    gap: 16,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  typeBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
  },
  homeownerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  notesText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0F8FF',
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});


























