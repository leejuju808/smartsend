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

interface ChecklistItem {
  text: string;
  done: boolean;
}

export default function JobChecklistScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [checklistType] = useState('pre-start');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crewMemberId, setCrewMemberId] = useState<string | null>(null);

  const defaultItems: ChecklistItem[] = [
    { text: 'Verify address matches job site', done: false },
    { text: 'Take BEFORE photos of roof', done: false },
    { text: 'Inspect roof decking for damage', done: false },
    { text: 'Confirm all materials are present', done: false },
    { text: 'Set up safety equipment and barriers', done: false },
    { text: 'Verify homeowner is aware of work starting', done: false },
  ];

  useEffect(() => {
    fetchCrewMemberId();
    fetchChecklist();
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

  const fetchChecklist = async () => {
    try {
      const { data, error } = await supabase
        .from('job_checklists')
        .select('*')
        .eq('job_id', jobId)
        .eq('checklist_type', checklistType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data && data.items) {
        setItems(data.items as ChecklistItem[]);
      } else {
        // Create new checklist with default items
        setItems(defaultItems);
      }
    } catch (error) {
      // No existing checklist, use defaults
      setItems(defaultItems);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (index: number) => {
    const newItems = [...items];
    newItems[index].done = !newItems[index].done;
    setItems(newItems);
  };

  const saveChecklist = async () => {
    setSaving(true);
    try {
      const allDone = items.every((item) => item.done);
      
      // Check if checklist exists
      const { data: existing } = await supabase
        .from('job_checklists')
        .select('id')
        .eq('job_id', jobId)
        .eq('checklist_type', checklistType)
        .single();

      const checklistData = {
        job_id: jobId,
        checklist_type: checklistType,
        items: items,
        completed: allDone,
        completed_at: allDone ? new Date().toISOString() : null,
        completed_by: crewMemberId,
      };

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('job_checklists')
          .update(checklistData)
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('job_checklists')
          .insert(checklistData);

        if (error) throw error;
      }

      if (allDone) {
        Alert.alert(
          'Checklist Complete!',
          'You can now start the time clock for this job.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Checklist Saved', 'Complete all items to start work.');
      }
    } catch (error) {
      console.error('Error saving checklist:', error);
      Alert.alert('Error', 'Failed to save checklist. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const allDone = items.every((item) => item.done);

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
        <Text style={styles.headerTitle}>Pre-Start Checklist</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Complete all items before starting work. This checklist is required to clock in.
        </Text>

        <View style={styles.checklistContainer}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.checklistItem, item.done && styles.checklistItemDone]}
              onPress={() => toggleItem(index)}
            >
              <View style={styles.checkbox}>
                {item.done && (
                  <MaterialCommunityIcons name="check" size={20} color="#10b981" />
                )}
              </View>
              <Text style={[styles.checklistText, item.done && styles.checklistTextDone]}>
                {item.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {items.filter((i) => i.done).length} of {items.length} completed
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(items.filter((i) => i.done).length / items.length) * 100}%` },
              ]}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, allDone && styles.saveButtonComplete]}
          onPress={saveChecklist}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons
                name={allDone ? 'check-circle' : 'content-save'}
                size={20}
                color="#fff"
              />
              <Text style={styles.saveButtonText}>
                {allDone ? 'Checklist Complete!' : 'Save Checklist'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {allDone && (
          <TouchableOpacity
            style={styles.clockInButton}
            onPress={() => router.push(`/crew/job/${jobId}/clock`)}
          >
            <MaterialCommunityIcons name="clock-in" size={20} color="#FF6B35" />
            <Text style={styles.clockInButtonText}>Start Time Clock</Text>
          </TouchableOpacity>
        )}
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
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  checklistContainer: {
    gap: 12,
    marginBottom: 24,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  checklistItemDone: {
    borderColor: '#10b981',
    backgroundColor: '#F0FDF4',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checklistText: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  checklistTextDone: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  saveButtonComplete: {
    backgroundColor: '#10b981',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  clockInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  clockInButtonText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '600',
  },
});


























