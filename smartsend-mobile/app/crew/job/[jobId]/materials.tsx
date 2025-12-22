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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { router, useLocalSearchParams } from 'expo-router';

interface MaterialItem {
  id?: string;
  material_name: string;
  quantity_expected: number;
  quantity_received: number;
  unit: string;
  verified: boolean;
  missing: boolean;
}

const DEFAULT_MATERIALS = [
  { material_name: 'Shingles', unit: 'bundles' },
  { material_name: 'Ridge', unit: 'bundles' },
  { material_name: 'Starter', unit: 'bundles' },
  { material_name: 'Underlayment', unit: 'rolls' },
  { material_name: 'Flashing', unit: 'pieces' },
  { material_name: 'Ice & Water', unit: 'rolls' },
  { material_name: 'Nails', unit: 'boxes' },
];

export default function MaterialsVerificationScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crewMemberId, setCrewMemberId] = useState<string | null>(null);

  useEffect(() => {
    fetchCrewMemberId();
    fetchMaterials();
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

  const fetchMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('material_verification')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setMaterials(data);
      } else {
        // Initialize with default materials
        setMaterials(
          DEFAULT_MATERIALS.map((m) => ({
            material_name: m.material_name,
            quantity_expected: 0,
            quantity_received: 0,
            unit: m.unit,
            verified: false,
            missing: false,
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
      // Initialize with defaults on error
      setMaterials(
        DEFAULT_MATERIALS.map((m) => ({
          material_name: m.material_name,
          quantity_expected: 0,
          quantity_received: 0,
          unit: m.unit,
          verified: false,
          missing: false,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const updateMaterial = (index: number, field: keyof MaterialItem, value: any) => {
    const newMaterials = [...materials];
    newMaterials[index] = { ...newMaterials[index], [field]: value };
    setMaterials(newMaterials);
  };

  const toggleVerified = (index: number) => {
    const newMaterials = [...materials];
    newMaterials[index].verified = !newMaterials[index].verified;
    newMaterials[index].missing = false; // Can't be both verified and missing
    setMaterials(newMaterials);
  };

  const toggleMissing = (index: number) => {
    const newMaterials = [...materials];
    newMaterials[index].missing = !newMaterials[index].missing;
    newMaterials[index].verified = false; // Can't be both verified and missing
    setMaterials(newMaterials);
  };

  const saveMaterials = async () => {
    if (!crewMemberId) {
      Alert.alert('Error', 'Crew member not found.');
      return;
    }

    setSaving(true);
    try {
      // Delete existing materials for this job
      await supabase.from('material_verification').delete().eq('job_id', jobId);

      // Insert updated materials
      const materialsToSave = materials.map((m) => ({
        job_id: jobId,
        crew_member_id: crewMemberId,
        material_name: m.material_name,
        quantity_expected: m.quantity_expected || 0,
        quantity_received: m.quantity_received || 0,
        unit: m.unit,
        verified: m.verified,
        missing: m.missing,
        verified_at: m.verified ? new Date().toISOString() : null,
      }));

      const { error } = await supabase.from('material_verification').insert(materialsToSave);

      if (error) throw error;

      const missingCount = materials.filter((m) => m.missing).length;
      if (missingCount > 0) {
        Alert.alert(
          'Materials Missing',
          `${missingCount} material(s) marked as missing. Office has been notified.`
        );
      } else {
        Alert.alert('Success', 'Materials verification saved!');
      }

      await fetchMaterials();
    } catch (error) {
      console.error('Error saving materials:', error);
      Alert.alert('Error', 'Failed to save materials. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const missingCount = materials.filter((m) => m.missing).length;
  const verifiedCount = materials.filter((m) => m.verified).length;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Materials Verification</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Verify all materials are present before starting work. Missing materials will alert the
          office.
        </Text>

        {missingCount > 0 && (
          <View style={styles.alertBanner}>
            <MaterialCommunityIcons name="alert" size={20} color="#FF6B35" />
            <Text style={styles.alertText}>
              {missingCount} material(s) marked as missing
            </Text>
          </View>
        )}

        {materials.map((material, index) => (
          <View key={index} style={styles.materialCard}>
            <View style={styles.materialHeader}>
              <Text style={styles.materialName}>{material.material_name}</Text>
              <View style={styles.materialActions}>
                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    material.verified && styles.statusButtonVerified,
                  ]}
                  onPress={() => toggleVerified(index)}
                >
                  <MaterialCommunityIcons
                    name={material.verified ? 'check-circle' : 'circle-outline'}
                    size={20}
                    color={material.verified ? '#10b981' : '#ccc'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusButton, material.missing && styles.statusButtonMissing]}
                  onPress={() => toggleMissing(index)}
                >
                  <MaterialCommunityIcons
                    name={material.missing ? 'close-circle' : 'circle-outline'}
                    size={20}
                    color={material.missing ? '#FF6B35' : '#ccc'}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.materialInputs}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Expected ({material.unit})</Text>
                <TextInput
                  style={styles.input}
                  value={material.quantity_expected?.toString() || ''}
                  onChangeText={(text) =>
                    updateMaterial(index, 'quantity_expected', parseFloat(text) || 0)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Received ({material.unit})</Text>
                <TextInput
                  style={styles.input}
                  value={material.quantity_received?.toString() || ''}
                  onChangeText={(text) =>
                    updateMaterial(index, 'quantity_received', parseFloat(text) || 0)
                  }
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>
            </View>

            {material.verified && (
              <View style={styles.verifiedBadge}>
                <MaterialCommunityIcons name="check" size={16} color="#10b981" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
            {material.missing && (
              <View style={styles.missingBadge}>
                <MaterialCommunityIcons name="alert" size={16} color="#FF6B35" />
                <Text style={styles.missingText}>Missing</Text>
              </View>
            )}
          </View>
        ))}

        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {verifiedCount} of {materials.length} materials verified
          </Text>
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={saveMaterials}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="content-save" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Verification</Text>
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
    marginBottom: 16,
    lineHeight: 20,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  alertText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
  },
  materialCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  materialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  materialName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  materialActions: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    padding: 4,
  },
  statusButtonVerified: {},
  statusButtonMissing: {},
  materialInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  verifiedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  missingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  missingText: {
    color: '#FF6B35',
    fontSize: 12,
    fontWeight: '600',
  },
  summary: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


























