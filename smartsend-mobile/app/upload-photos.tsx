import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabaseClient';
import { router } from 'expo-router';

export default function UploadPhotosScreen() {
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string>('');

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to upload photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImages([...selectedImages, ...result.assets.map((asset) => asset.uri)]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera permissions to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled) {
      setSelectedImages([...selectedImages, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
  };

  const uploadPhotos = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('No photos', 'Please select at least one photo to upload');
      return;
    }

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const uploadedUrls: string[] = [];

      for (const imageUri of selectedImages) {
        // Convert image to blob
        const response = await fetch(imageUri);
        const blob = await response.blob();

        // Generate unique filename
        const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('job-media')
          .upload(filename, blob, {
            contentType: 'image/jpeg',
            upsert: false,
        });

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('job-media').getPublicUrl(filename);

        uploadedUrls.push(publicUrl);

        // Save to job_media table if job_id is provided
        if (jobId) {
          const { error: dbError } = await supabase.from('job_media').insert({
            job_id: jobId,
            user_id: user.id,
            url: publicUrl,
          });

          if (dbError) console.error('Error saving to database:', dbError);
        }
      }

      Alert.alert('Success', `${uploadedUrls.length} photo(s) uploaded successfully!`);
      setSelectedImages([]);
      setJobId('');
    } catch (error: any) {
      Alert.alert('Upload Error', error.message || 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Upload Job Photos</Text>
        <Text style={styles.headerSubtitle}>Capture and share job progress</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={pickImage}>
          <MaterialCommunityIcons name="image-multiple" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>Choose Photos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={takePhoto}>
          <MaterialCommunityIcons name="camera" size={24} color="#007AFF" />
          <Text style={styles.actionButtonText}>Take Photo</Text>
        </TouchableOpacity>
      </View>

      {selectedImages.length > 0 && (
        <View style={styles.imagesContainer}>
          <Text style={styles.sectionTitle}>Selected Photos ({selectedImages.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {selectedImages.map((uri, index) => (
              <View key={index} style={styles.imageWrapper}>
                <Image source={{ uri }} style={styles.image} />
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeImage(index)}
                >
                  <MaterialCommunityIcons name="close-circle" size={24} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <TouchableOpacity
        style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
        onPress={uploadPhotos}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialCommunityIcons name="cloud-upload" size={24} color="#fff" />
            <Text style={styles.uploadButtonText}>
              Upload {selectedImages.length > 0 ? `${selectedImages.length} ` : ''}Photo
              {selectedImages.length !== 1 ? 's' : ''}
            </Text>
          </>
        )}
      </TouchableOpacity>
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
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  imagesContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  imageWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  image: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


























