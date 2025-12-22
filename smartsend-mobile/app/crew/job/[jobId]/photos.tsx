import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabaseClient';
import { router, useLocalSearchParams } from 'expo-router';

interface Photo {
  id: string;
  photo_url: string;
  label: string;
  created_at: string;
}

const PHOTO_CATEGORIES = [
  { key: 'before', label: 'BEFORE', icon: 'camera-outline' },
  { key: 'tear-off', label: 'TEAR-OFF', icon: 'hammer' },
  { key: 'underlayment', label: 'UNDERLAYMENT', icon: 'layers' },
  { key: 'installation', label: 'INSTALLATION', icon: 'hammer-wrench' },
  { key: 'completed', label: 'COMPLETED', icon: 'check-circle' },
];

export default function PhotoUploadScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [selectedCategory, setSelectedCategory] = useState('before');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [crewMemberId, setCrewMemberId] = useState<string | null>(null);

  useEffect(() => {
    fetchCrewMemberId();
    fetchPhotos();
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

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });

      if (data) {
        setPhotos(data);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll access to upload photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri: string) => {
    setUploading(true);
    try {
      // Convert image to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Generate unique filename
      const fileExt = uri.split('.').pop();
      const fileName = `${jobId}/${selectedCategory}_${Date.now()}.${fileExt}`;
      const filePath = `job-photos/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('job-photos').getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase.from('job_photos').insert({
        job_id: jobId,
        member_id: crewMemberId,
        category: selectedCategory,
        url: publicUrl,
        storage_path: filePath,
        label: PHOTO_CATEGORIES.find((c) => c.key === selectedCategory)?.label || selectedCategory,
      });

      if (dbError) throw dbError;

      Alert.alert('Success', 'Photo uploaded successfully!');
      await fetchPhotos();
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const filteredPhotos = photos.filter((p) => p.category === selectedCategory);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Photos</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Upload photos for insurance claims, homeowner portal, and quality control
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {PHOTO_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.key}
              style={[
                styles.categoryButton,
                selectedCategory === category.key && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(category.key)}
            >
              <MaterialCommunityIcons
                name={category.icon as any}
                size={20}
                color={selectedCategory === category.key ? '#fff' : '#666'}
              />
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category.key && styles.categoryTextActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.uploadButtons}>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={takePhoto}
            disabled={uploading}
          >
            <MaterialCommunityIcons name="camera" size={24} color="#fff" />
            <Text style={styles.uploadButtonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.uploadButton, styles.uploadButtonSecondary]}
            onPress={pickImage}
            disabled={uploading}
          >
            <MaterialCommunityIcons name="image" size={24} color="#FF6B35" />
            <Text style={[styles.uploadButtonText, styles.uploadButtonTextSecondary]}>
              Choose from Gallery
            </Text>
          </TouchableOpacity>
        </View>

        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.uploadingText}>Uploading photo...</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {PHOTO_CATEGORIES.find((c) => c.key === selectedCategory)?.label} Photos (
          {filteredPhotos.length})
        </Text>

        {filteredPhotos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="camera-off" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No {selectedCategory} photos yet</Text>
          </View>
        ) : (
          <View style={styles.photosGrid}>
            {filteredPhotos.map((photo) => (
              <View key={photo.id} style={styles.photoContainer}>
                <Image source={{ uri: photo.photo_url }} style={styles.photo} />
                <Text style={styles.photoLabel}>{photo.label}</Text>
              </View>
            ))}
          </View>
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
  categoryScroll: {
    marginBottom: 16,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  categoryButtonActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  categoryTextActive: {
    color: '#fff',
  },
  uploadButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  uploadButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButtonTextSecondary: {
    color: '#FF6B35',
  },
  uploadingContainer: {
    alignItems: 'center',
    padding: 20,
    marginBottom: 16,
  },
  uploadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoContainer: {
    width: '47%',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
  },
  photoLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});


























