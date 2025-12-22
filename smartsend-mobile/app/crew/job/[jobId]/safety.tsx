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

export default function SafetyLogScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [weather, setWeather] = useState('');
  const [windSpeed, setWindSpeed] = useState('');
  const [hazards, setHazards] = useState<string[]>([]);
  const [hazardInput, setHazardInput] = useState('');
  const [ppeUsed, setPpeUsed] = useState<string[]>([]);
  const [ladderTieOffs, setLadderTieOffs] = useState(false);
  const [equipmentChecks, setEquipmentChecks] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [crewMemberId, setCrewMemberId] = useState<string | null>(null);

  const PPE_OPTIONS = ['Hard Hat', 'Safety Glasses', 'Gloves', 'Safety Harness', 'Steel Toe Boots'];
  const EQUIPMENT_OPTIONS = ['Ladders', 'Scaffolding', 'Safety Barriers', 'Tarps', 'Tools'];

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

  const togglePPE = (item: string) => {
    if (ppeUsed.includes(item)) {
      setPpeUsed(ppeUsed.filter((i) => i !== item));
    } else {
      setPpeUsed([...ppeUsed, item]);
    }
  };

  const toggleEquipment = (item: string) => {
    if (equipmentChecks.includes(item)) {
      setEquipmentChecks(equipmentChecks.filter((i) => i !== item));
    } else {
      setEquipmentChecks([...equipmentChecks, item]);
    }
  };

  const addHazard = () => {
    if (hazardInput.trim()) {
      setHazards([...hazards, hazardInput.trim()]);
      setHazardInput('');
    }
  };

  const removeHazard = (index: number) => {
    setHazards(hazards.filter((_, i) => i !== index));
  };

  const saveSafetyLog = async () => {
    if (!crewMemberId) {
      Alert.alert('Error', 'Crew member not found.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('safety_logs').insert({
        job_id: jobId,
        crew_member_id: crewMemberId,
        weather,
        wind_speed: windSpeed,
        hazards,
        compliance: {
          ppe_used: ppeUsed,
          ladder_tie_offs: ladderTieOffs,
          equipment_checks: equipmentChecks,
        },
        notes,
      });

      if (error) throw error;

      Alert.alert('Success', 'Safety log saved!');
      router.back();
    } catch (error) {
      console.error('Error saving safety log:', error);
      Alert.alert('Error', 'Failed to save safety log. Please try again.');
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
        <Text style={styles.headerTitle}>Safety Log</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Complete OSHA compliance checklist. This protects you and the company.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weather Conditions</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Sunny, 75°F"
            value={weather}
            onChangeText={setWeather}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wind Speed</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., 5-10 mph"
            value={windSpeed}
            onChangeText={setWindSpeed}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hazards Identified</Text>
          {hazards.map((hazard, index) => (
            <View key={index} style={styles.hazardItem}>
              <Text style={styles.hazardText}>{hazard}</Text>
              <TouchableOpacity onPress={() => removeHazard(index)}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#FF6B35" />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.hazardInputContainer}>
            <TextInput
              style={styles.hazardInput}
              placeholder="Add hazard..."
              value={hazardInput}
              onChangeText={setHazardInput}
              onSubmitEditing={addHazard}
            />
            <TouchableOpacity style={styles.addButton} onPress={addHazard}>
              <MaterialCommunityIcons name="plus-circle" size={24} color="#FF6B35" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PPE Used</Text>
          <View style={styles.checkboxGrid}>
            {PPE_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.checkbox,
                  ppeUsed.includes(item) && styles.checkboxChecked,
                ]}
                onPress={() => togglePPE(item)}
              >
                <MaterialCommunityIcons
                  name={ppeUsed.includes(item) ? 'check-circle' : 'circle-outline'}
                  size={20}
                  color={ppeUsed.includes(item) ? '#10b981' : '#ccc'}
                />
                <Text
                  style={[
                    styles.checkboxText,
                    ppeUsed.includes(item) && styles.checkboxTextChecked,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ladder Tie-Offs</Text>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setLadderTieOffs(!ladderTieOffs)}
          >
            <MaterialCommunityIcons
              name={ladderTieOffs ? 'check-circle' : 'circle-outline'}
              size={24}
              color={ladderTieOffs ? '#10b981' : '#ccc'}
            />
            <Text style={styles.toggleText}>
              {ladderTieOffs ? 'Tie-offs verified' : 'Tie-offs not verified'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipment Checks</Text>
          <View style={styles.checkboxGrid}>
            {EQUIPMENT_OPTIONS.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.checkbox,
                  equipmentChecks.includes(item) && styles.checkboxChecked,
                ]}
                onPress={() => toggleEquipment(item)}
              >
                <MaterialCommunityIcons
                  name={equipmentChecks.includes(item) ? 'check-circle' : 'circle-outline'}
                  size={20}
                  color={equipmentChecks.includes(item) ? '#10b981' : '#ccc'}
                />
                <Text
                  style={[
                    styles.checkboxText,
                    equipmentChecks.includes(item) && styles.checkboxTextChecked,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any additional safety observations..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        <TouchableOpacity
          style={styles.saveButton}
          onPress={saveSafetyLog}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="shield-check" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Safety Log</Text>
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
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  hazardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  hazardText: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
  },
  hazardInputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  hazardInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  addButton: {
    padding: 4,
  },
  checkboxGrid: {
    gap: 12,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 12,
  },
  checkboxChecked: {
    borderColor: '#10b981',
    backgroundColor: '#F0FDF4',
  },
  checkboxText: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  checkboxTextChecked: {
    color: '#10b981',
    fontWeight: '600',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 12,
  },
  toggleText: {
    fontSize: 16,
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
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


























