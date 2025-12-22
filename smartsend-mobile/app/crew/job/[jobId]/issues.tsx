import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabaseClient';
import { router, useLocalSearchParams } from 'expo-router';

const ISSUE_TYPES = [
  { key: 'decking_rot', label: 'Decking Rot' },
  { key: 'wrong_color', label: 'Wrong Color' },
  { key: 'missing_materials', label: 'Missing Materials' },
  { key: 'structural_issue', label: 'Structural Issue' },
  { key: 'homeowner_request', label: 'Homeowner Request' },
  { key: 'crew_note', label: 'Crew Note' },
];

const SEVERITY_OPTIONS = [
  { key: 'low', label: 'Low', color: '#10b981' },
  { key: 'medium', label: 'Medium', color: '#f59e0b' },
  { key: 'high', label: 'High', color: '#ef4444' },
];

export default function IssueReportingScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [issueType, setIssueType] = useState('crew_note');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [crewMemberId, setCrewMemberId] = useState<string | null>(null);

  useEffect(() => {
    fetchCrewMemberId();
  }, []);

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

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll access.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera access.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExt = uri.split('.').pop();
      const fileName = `${jobId}/issue_${Date.now()}.${fileExt}`;
      const filePath = `job-photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('job-photos').getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading photo:', error);
      return null;
    }
  };

  const submitIssue = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a description.');
      return;
    }

    if (!crewMemberId) {
      Alert.alert('Error', 'Crew member not found.');
      return;
    }

    setSaving(true);
    try {
      let finalPhotoUrl = photoUrl;

      // Upload photo if selected
      if (photoUri && !photoUrl) {
        finalPhotoUrl = await uploadPhoto(photoUri);
        if (!finalPhotoUrl) {
          Alert.alert('Warning', 'Photo upload failed, but issue will still be submitted.');
        }
      }

      const { error } = await supabase.from('job_issues').insert({
        job_id: jobId,
        crew_member_id: crewMemberId,
        issue_type: issueType,
        severity,
        description: description.trim(),
        photo_url: finalPhotoUrl,
        status: 'open',
      });

      if (error) throw error;

      Alert.alert(
        'Issue Reported',
        'The office has been notified. They will review and respond soon.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting issue:', error);
      Alert.alert('Error', 'Failed to submit issue. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Issue</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Report any issues, concerns, or changes needed on this job. The office will be notified
          immediately.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issue Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ISSUE_TYPES.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.typeButton,
                  issueType === type.key && styles.typeButtonActive,
                ]}
                onPress={() => setIssueType(type.key)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    issueType === type.key && styles.typeButtonTextActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Severity</Text>
          <View style={styles.severityContainer}>
            {SEVERITY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.severityButton,
                  severity === option.key && {
                    backgroundColor: option.color,
                    borderColor: option.color,
                  },
                ]}
                onPress={() => setSeverity(option.key)}
              >
                <Text
                  style={[
                    styles.severityButtonText,
                    severity === option.key && styles.severityButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the issue in detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photo (Optional)</Text>
          {photoUri ? (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photoUri }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={() => {
                  setPhotoUri(null);
                  setPhotoUrl(null);
                }}
              >
                <MaterialCommunityIcons name="close-circle" size={24} color="#FF6B35" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                <MaterialCommunityIcons name="camera" size={24} color="#FF6B35" />
                <Text style={styles.photoButtonText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoButton, styles.photoButtonSecondary]}
                onPress={pickImage}
              >
                <MaterialCommunityIcons name="image" size={24} color="#FF6B35" />
                <Text style={styles.photoButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={submitIssue}
          disabled={saving || !description.trim()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="send" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Submit Issue</Text>
            </>
          )}
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  typeButtonActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  severityContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  severityButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  severityButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  severityButtonTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 150,
    textAlignVertical: 'top',
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  photoButton: {
    flex: 1,
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
  photoButtonSecondary: {
    backgroundColor: '#FFF5F0',
  },
  photoButtonText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


























