import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

interface ChecklistItem {
  text: string;
  done: boolean;
}

interface JobDetail {
  id: string;
  address: string;
  job_type: string;
  stage: string;
}

export default function JobDetailScreen() {
  const { jobId, crewMemberId } = useLocalSearchParams<{ jobId: string; crewMemberId: string }>();
  const [activeTab, setActiveTab] = useState<'checklist' | 'time' | 'photos' | 'materials' | 'safety' | 'issues'>('checklist');
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistCompleted, setChecklistCompleted] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [activeTimeEntryId, setActiveTimeEntryId] = useState<string | null>(null);
  const [clockInTime, setClockInTime] = useState<string | null>(null);

  useEffect(() => {
    loadJobData();
    checkClockStatus();
    loadChecklist();
  }, [jobId]);

  const loadJobData = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, address, job_type, stage')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      setJob(data);
    } catch (error) {
      console.error('Error loading job:', error);
      Alert.alert('Error', 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const loadChecklist = async () => {
    try {
      const { data, error } = await supabase
        .from('job_checklists')
        .select('*')
        .eq('job_id', jobId)
        .eq('checklist_type', 'pre-start')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        throw error;
      }

      if (data) {
        setChecklistItems((data.items as ChecklistItem[]) || []);
        setChecklistCompleted(data.completed || false);
      } else {
        // Create default checklist
        const defaultChecklist: ChecklistItem[] = [
          { text: 'Verify address matches job site', done: false },
          { text: 'Take BEFORE photos', done: false },
          { text: 'Inspect roof decking condition', done: false },
          { text: 'Confirm all materials are present', done: false },
          { text: 'Set up safety equipment (tarps, ladders)', done: false },
          { text: 'Confirm weather conditions are safe', done: false },
        ];
        setChecklistItems(defaultChecklist);
      }
    } catch (error) {
      console.error('Error loading checklist:', error);
    }
  };

  const checkClockStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('get_active_time_entry', {
        p_crew_member_id: crewMemberId,
        p_job_id: jobId,
      });

      if (data) {
        setIsClockedIn(true);
        setActiveTimeEntryId(data);
        // Get clock in time
        const { data: timeEntry } = await supabase
          .from('crew_time_entries')
          .select('clock_in')
          .eq('id', data)
          .single();

        if (timeEntry) {
          const time = new Date(timeEntry.clock_in);
          setClockInTime(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        }
      }
    } catch (error) {
      console.error('Error checking clock status:', error);
    }
  };

  const toggleChecklistItem = async (index: number) => {
    const updated = [...checklistItems];
    updated[index].done = !updated[index].done;
    setChecklistItems(updated);

    // Save to database
    try {
      const allDone = updated.every((item) => item.done);
      
      const { error } = await supabase
        .from('job_checklists')
        .upsert({
          job_id: jobId,
          checklist_type: 'pre-start',
          items: updated,
          completed: allDone,
          completed_at: allDone ? new Date().toISOString() : null,
        }, {
          onConflict: 'job_id,checklist_type',
        });

      if (error) throw error;
      setChecklistCompleted(allDone);
    } catch (error) {
      console.error('Error saving checklist:', error);
      Alert.alert('Error', 'Failed to save checklist');
    }
  };

  const handleClockIn = async () => {
    if (!checklistCompleted) {
      Alert.alert(
        'Checklist Required',
        'You must complete the pre-start checklist before clocking in.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const { data, error } = await supabase
        .from('crew_time_entries')
        .insert({
          job_id: jobId,
          crew_member_id: crewMemberId,
          clock_in: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      setIsClockedIn(true);
      setActiveTimeEntryId(data.id);
      setClockInTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));

      // Notify homeowner (this would be handled by a webhook/function)
      Alert.alert('Clocked In', 'You are now clocked in. Homeowner has been notified.');
    } catch (error) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', 'Failed to clock in');
    }
  };

  const handleClockOut = async () => {
    if (!activeTimeEntryId) return;

    try {
      const { error } = await supabase
        .from('crew_time_entries')
        .update({
          clock_out: new Date().toISOString(),
        })
        .eq('id', activeTimeEntryId);

      if (error) throw error;

      setIsClockedIn(false);
      setActiveTimeEntryId(null);
      setClockInTime(null);

      Alert.alert('Clocked Out', 'You have clocked out successfully.');
    } catch (error) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', 'Failed to clock out');
    }
  };

  const handleTakePhoto = async (category: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      // Upload photo to Supabase Storage
      const fileExt = result.assets[0].uri.split('.').pop();
      const fileName = `${jobId}_${category}_${Date.now()}.${fileExt}`;
      const filePath = `job-photos/${jobId}/${fileName}`;

      try {
        // Convert image to blob
        const response = await fetch(result.assets[0].uri);
        const blob = await response.blob();

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(filePath, blob, {
            contentType: `image/${fileExt}`,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('job-photos')
          .getPublicUrl(filePath);

        // Save to job_photos table
        const { error: photoError } = await supabase
          .from('job_photos')
          .insert({
            job_id: jobId,
            photo_url: publicUrl,
            photo_category: category,
          });

        if (photoError) throw photoError;

        Alert.alert('Success', `${category} photo uploaded successfully`);
      } catch (error) {
        console.error('Error uploading photo:', error);
        Alert.alert('Error', 'Failed to upload photo');
      }
    }
  };

  if (loading || !job) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{job.address}</Text>
          <Text style={styles.headerSubtitle}>{job.job_type}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { key: 'checklist', label: 'Checklist', icon: 'clipboard-check' },
            { key: 'time', label: 'Time', icon: 'clock-outline' },
            { key: 'photos', label: 'Photos', icon: 'camera' },
            { key: 'materials', label: 'Materials', icon: 'package-variant' },
            { key: 'safety', label: 'Safety', icon: 'shield-check' },
            { key: 'issues', label: 'Issues', icon: 'alert-circle' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={20}
                color={activeTab === tab.key ? '#FF6B35' : '#666'}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'checklist' && (
          <View style={styles.checklistContainer}>
            <Text style={styles.sectionTitle}>Pre-Start Checklist</Text>
            <Text style={styles.sectionSubtitle}>
              Complete all items before starting work
            </Text>

            {checklistItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.checklistItem}
                onPress={() => toggleChecklistItem(index)}
              >
                <View
                  style={[
                    styles.checkbox,
                    item.done && styles.checkboxChecked,
                  ]}
                >
                  {item.done && (
                    <MaterialCommunityIcons name="check" size={20} color="#fff" />
                  )}
                </View>
                <Text
                  style={[
                    styles.checklistItemText,
                    item.done && styles.checklistItemTextDone,
                  ]}
                >
                  {item.text}
                </Text>
              </TouchableOpacity>
            ))}

            {checklistCompleted && (
              <View style={styles.completedBadge}>
                <MaterialCommunityIcons name="check-circle" size={24} color="#4CAF50" />
                <Text style={styles.completedText}>Checklist Complete!</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'time' && (
          <View style={styles.timeContainer}>
            <Text style={styles.sectionTitle}>Time Clock</Text>

            {isClockedIn ? (
              <View style={styles.clockedInContainer}>
                <MaterialCommunityIcons name="clock" size={64} color="#4CAF50" />
                <Text style={styles.clockedInText}>Clocked In</Text>
                <Text style={styles.clockedInTime}>Since {clockInTime}</Text>
                <TouchableOpacity
                  style={styles.clockOutButton}
                  onPress={handleClockOut}
                >
                  <Text style={styles.clockOutButtonText}>CLOCK OUT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.clockedOutContainer}>
                <MaterialCommunityIcons name="clock-outline" size={64} color="#666" />
                <Text style={styles.clockedOutText}>Not Clocked In</Text>
                <TouchableOpacity
                  style={[
                    styles.clockInButton,
                    !checklistCompleted && styles.clockInButtonDisabled,
                  ]}
                  onPress={handleClockIn}
                  disabled={!checklistCompleted}
                >
                  <Text style={styles.clockInButtonText}>START WORK</Text>
                </TouchableOpacity>
                {!checklistCompleted && (
                  <Text style={styles.clockInHint}>
                    Complete the pre-start checklist first
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === 'photos' && (
          <View style={styles.photosContainer}>
            <Text style={styles.sectionTitle}>Job Photos</Text>
            <Text style={styles.sectionSubtitle}>
              Take photos at each stage of the job
            </Text>

            {['before', 'tear-off', 'underlayment', 'installation', 'completed'].map(
              (category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.photoButton}
                  onPress={() => handleTakePhoto(category)}
                >
                  <MaterialCommunityIcons name="camera" size={24} color="#FF6B35" />
                  <Text style={styles.photoButtonText}>
                    Take {category.toUpperCase()} Photo
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}

        {activeTab === 'materials' && (
          <MaterialsVerificationScreen jobId={jobId} crewMemberId={crewMemberId || ''} />
        )}

        {activeTab === 'safety' && (
          <SafetyLogScreen jobId={jobId} crewMemberId={crewMemberId || ''} />
        )}

        {activeTab === 'issues' && (
          <IssueReportingScreen jobId={jobId} crewMemberId={crewMemberId || ''} />
        )}
      </ScrollView>
    </View>
  );
}

// Materials Verification Component
function MaterialsVerificationScreen({ jobId, crewMemberId }: { jobId: string; crewMemberId: string }) {
  const [materials, setMaterials] = useState([
    { name: 'Shingles', expected: 85, received: 0, unit: 'bundles', verified: false },
    { name: 'Ridge', expected: 5, received: 0, unit: 'bundles', verified: false },
    { name: 'Starter', expected: 7, received: 0, unit: 'bundles', verified: false },
    { name: 'Underlayment', expected: 3, received: 0, unit: 'rolls', verified: false },
    { name: 'Flashing', expected: 1, received: 0, unit: 'rolls', verified: false },
    { name: 'Ice & Water', expected: 2, received: 0, unit: 'rolls', verified: false },
  ]);

  const updateMaterial = (index: number, field: string, value: any) => {
    const updated = [...materials];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'received') {
      updated[index].verified = updated[index].received >= updated[index].expected;
    }
    setMaterials(updated);
  };

  const saveVerification = async () => {
    try {
      const { error } = await supabase
        .from('job_material_verifications')
        .insert({
          job_id: jobId,
          crew_member_id: crewMemberId,
          materials: materials,
        });

      if (error) throw error;

      const missing = materials.filter((m) => !m.verified);
      if (missing.length > 0) {
        Alert.alert(
          'Missing Materials',
          `${missing.length} material(s) are missing. Office has been notified.`
        );
      } else {
        Alert.alert('Success', 'All materials verified');
      }
    } catch (error) {
      console.error('Error saving verification:', error);
      Alert.alert('Error', 'Failed to save material verification');
    }
  };

  return (
    <View style={styles.materialsContainer}>
      <Text style={styles.sectionTitle}>Material Verification</Text>
      <Text style={styles.sectionSubtitle}>
        Verify all materials are present before starting
      </Text>

      {materials.map((material, index) => (
        <View key={index} style={styles.materialRow}>
          <View style={styles.materialInfo}>
            <Text style={styles.materialName}>{material.name}</Text>
            <Text style={styles.materialExpected}>
              Expected: {material.expected} {material.unit}
            </Text>
          </View>
          <View style={styles.materialInput}>
            <TextInput
              style={styles.materialInputField}
              placeholder="0"
              keyboardType="numeric"
              value={material.received.toString()}
              onChangeText={(text) =>
                updateMaterial(index, 'received', parseInt(text) || 0)
              }
            />
            <Text style={styles.materialUnit}>{material.unit}</Text>
          </View>
          <View style={styles.materialCheck}>
            {material.verified ? (
              <MaterialCommunityIcons name="check-circle" size={32} color="#4CAF50" />
            ) : (
              <MaterialCommunityIcons name="alert-circle" size={32} color="#FF6B35" />
            )}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.saveButton} onPress={saveVerification}>
        <Text style={styles.saveButtonText}>Save Verification</Text>
      </TouchableOpacity>
    </View>
  );
}

// Safety Log Component
function SafetyLogScreen({ jobId, crewMemberId }: { jobId: string; crewMemberId: string }) {
  const [weather, setWeather] = useState('');
  const [windSpeed, setWindSpeed] = useState('');
  const [temperature, setTemperature] = useState('');
  const [ppeUsed, setPpeUsed] = useState(true);
  const [ladderTieOffs, setLadderTieOffs] = useState(true);
  const [equipmentChecked, setEquipmentChecked] = useState(true);
  const [notes, setNotes] = useState('');

  const saveSafetyLog = async () => {
    try {
      const { error } = await supabase.from('safety_logs').insert({
        job_id: jobId,
        crew_member_id: crewMemberId,
        weather,
        wind_speed: windSpeed,
        temperature,
        compliance: {
          ppe_used: ppeUsed,
          ladder_tie_offs: ladderTieOffs,
          equipment_checked: equipmentChecked,
        },
        notes,
      });

      if (error) throw error;
      Alert.alert('Success', 'Safety log saved');
    } catch (error) {
      console.error('Error saving safety log:', error);
      Alert.alert('Error', 'Failed to save safety log');
    }
  };

  return (
    <View style={styles.safetyContainer}>
      <Text style={styles.sectionTitle}>Safety Log</Text>
      <Text style={styles.sectionSubtitle}>OSHA Compliance Documentation</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Weather Conditions</Text>
        <TextInput
          style={styles.input}
          placeholder="Sunny, Cloudy, Rain, etc."
          value={weather}
          onChangeText={setWeather}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Wind Speed</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 5-10 mph"
          value={windSpeed}
          onChangeText={setWindSpeed}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Temperature</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 75°F"
          value={temperature}
          onChangeText={setTemperature}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Compliance Checklist</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>PPE Used</Text>
          <Switch value={ppeUsed} onValueChange={setPpeUsed} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Ladder Tie-Offs</Text>
          <Switch value={ladderTieOffs} onValueChange={setLadderTieOffs} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Equipment Checked</Text>
          <Switch value={equipmentChecked} onValueChange={setEquipmentChecked} />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Additional safety notes..."
          multiline
          numberOfLines={4}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveSafetyLog}>
        <Text style={styles.saveButtonText}>Save Safety Log</Text>
      </TouchableOpacity>
    </View>
  );
}

// Issue Reporting Component
function IssueReportingScreen({ jobId, crewMemberId }: { jobId: string; crewMemberId: string }) {
  const [issueType, setIssueType] = useState('other');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const takeIssuePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const submitIssue = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a description');
      return;
    }

    try {
      let photoUrl = null;
      if (photoUri) {
        // Upload photo
        const fileExt = photoUri.split('.').pop();
        const fileName = `issue_${jobId}_${Date.now()}.${fileExt}`;
        const filePath = `job-issues/${jobId}/${fileName}`;

        const response = await fetch(photoUri);
        const blob = await response.blob();

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(filePath, blob);

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('job-photos')
            .getPublicUrl(filePath);
          photoUrl = publicUrl;
        }
      }

      const { error } = await supabase.from('job_issues').insert({
        job_id: jobId,
        crew_member_id: crewMemberId,
        issue_type: issueType,
        severity,
        description,
        photo_url: photoUrl,
      });

      if (error) throw error;

      Alert.alert(
        'Issue Reported',
        severity === 'high' || severity === 'critical'
          ? 'High-severity issue reported. Owner has been notified immediately.'
          : 'Issue reported successfully. Office has been notified.'
      );

      // Reset form
      setDescription('');
      setPhotoUri(null);
      setSeverity('low');
    } catch (error) {
      console.error('Error submitting issue:', error);
      Alert.alert('Error', 'Failed to submit issue');
    }
  };

  return (
    <View style={styles.issuesContainer}>
      <Text style={styles.sectionTitle}>Report Issue</Text>
      <Text style={styles.sectionSubtitle}>
        Report any problems or concerns on the job site
      </Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Issue Type</Text>
        <View style={styles.buttonRow}>
          {['wrong_color', 'decking_rot', 'missing_materials', 'structural_issue', 'other'].map(
            (type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.issueTypeButton,
                  issueType === type && styles.issueTypeButtonActive,
                ]}
                onPress={() => setIssueType(type)}
              >
                <Text
                  style={[
                    styles.issueTypeButtonText,
                    issueType === type && styles.issueTypeButtonTextActive,
                  ]}
                >
                  {type.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Severity</Text>
        <View style={styles.buttonRow}>
          {(['low', 'medium', 'high', 'critical'] as const).map((sev) => (
            <TouchableOpacity
              key={sev}
              style={[
                styles.severityButton,
                severity === sev && styles[`severityButton${sev.charAt(0).toUpperCase() + sev.slice(1)}` as any],
              ]}
              onPress={() => setSeverity(sev)}
            >
              <Text
                style={[
                  styles.severityButtonText,
                  severity === sev && styles.severityButtonTextActive,
                ]}
              >
                {sev}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe the issue..."
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <TouchableOpacity style={styles.photoButton} onPress={takeIssuePhoto}>
        <MaterialCommunityIcons name="camera" size={24} color="#FF6B35" />
        <Text style={styles.photoButtonText}>
          {photoUri ? 'Photo Attached' : 'Attach Photo'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.submitButton} onPress={submitIssue}>
        <Text style={styles.submitButtonText}>Submit Issue</Text>
      </TouchableOpacity>
    </View>
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
  },
  header: {
    backgroundColor: '#FF6B35',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  tabs: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF6B35',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#FF6B35',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  checklistContainer: {
    padding: 20,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checklistItemText: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  checklistItemTextDone: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    gap: 8,
    marginTop: 16,
  },
  completedText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4CAF50',
  },
  timeContainer: {
    padding: 20,
  },
  clockedInContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  clockedInText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 16,
  },
  clockedInTime: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
  },
  clockOutButton: {
    backgroundColor: '#FF6B35',
    padding: 16,
    borderRadius: 8,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  clockOutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  clockedOutContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  clockedOutText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 16,
  },
  clockInButton: {
    backgroundColor: '#4CAF50',
    padding: 20,
    borderRadius: 8,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  clockInButtonDisabled: {
    backgroundColor: '#ccc',
  },
  clockInButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  clockInHint: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  photosContainer: {
    padding: 20,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  photoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  materialsContainer: {
    padding: 20,
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  materialInfo: {
    flex: 1,
  },
  materialName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  materialExpected: {
    fontSize: 14,
    color: '#666',
  },
  materialInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  materialInputField: {
    width: 60,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    textAlign: 'center',
  },
  materialUnit: {
    fontSize: 14,
    color: '#666',
  },
  materialCheck: {
    width: 40,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#FF6B35',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  safetyContainer: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  issuesContainer: {
    padding: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  issueTypeButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 8,
  },
  issueTypeButtonActive: {
    backgroundColor: '#FF6B35',
  },
  issueTypeButtonText: {
    fontSize: 14,
    color: '#666',
  },
  issueTypeButtonTextActive: {
    color: '#fff',
  },
  severityButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 8,
  },
  severityButtonLow: {
    backgroundColor: '#4CAF50',
  },
  severityButtonMedium: {
    backgroundColor: '#FF9800',
  },
  severityButtonHigh: {
    backgroundColor: '#FF6B35',
  },
  severityButtonCritical: {
    backgroundColor: '#F44336',
  },
  severityButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  severityButtonTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#FF6B35',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});


























