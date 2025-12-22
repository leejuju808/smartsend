// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// AR Scanner Screen for Mobile App
// ARKit/ARCore-based roof measurement scanner

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { createClient } from "../lib/supabaseClient";

const { width, height } = Dimensions.get("window");

interface ARPoint {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

interface MeasurementData {
  points: ARPoint[];
  distances: number[];
  angles: number[];
  perimeter: number;
  facets: number;
  squares: number;
}

export default function ARScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ jobId: string }>();
  const jobId = params.jobId;

  const [isScanning, setIsScanning] = useState(false);
  const [measurementData, setMeasurementData] = useState<MeasurementData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pointsRef = useRef<ARPoint[]>([]);
  const startTimeRef = useRef<number>(0);

  const handleStartScan = () => {
    setIsScanning(true);
    pointsRef.current = [];
    startTimeRef.current = Date.now();
    
    // Simulate AR scanning (in production, this would use ARKit/ARCore via Expo Modules)
    // For now, we'll provide a placeholder implementation
    Alert.alert(
      "AR Scanning",
      "Walk around the perimeter of the roof while keeping the device level. The scanner will record points, distances, and angles automatically.",
      [
        {
          text: "Start Scanning",
          onPress: () => {
            // In production, initialize AR session here
            simulateARScanning();
          },
        },
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setIsScanning(false),
        },
      ]
    );
  };

  const simulateARScanning = () => {
    // Simulate collecting AR points over 30 seconds
    // In production, this would be handled by ARKit/ARCore
    const interval = setInterval(() => {
      const point: ARPoint = {
        x: Math.random() * 100,
        y: Math.random() * 100,
        z: Math.random() * 100,
        timestamp: Date.now(),
      };
      pointsRef.current.push(point);

      if (pointsRef.current.length >= 50) {
        clearInterval(interval);
        calculateMeasurements();
      }
    }, 500);
  };

  const calculateMeasurements = () => {
    const points = pointsRef.current;
    const distances: number[] = [];
    const angles: number[] = [];

    // Calculate distances between consecutive points
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const distance = Math.sqrt(
        Math.pow(curr.x - prev.x, 2) +
        Math.pow(curr.y - prev.y, 2) +
        Math.pow(curr.z - prev.z, 2)
      );
      distances.push(distance);
    }

    // Calculate angles
    for (let i = 2; i < points.length; i++) {
      const p1 = points[i - 2];
      const p2 = points[i - 1];
      const p3 = points[i];
      
      const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
      
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
      const angle = Math.acos(dot / (mag1 * mag2)) * (180 / Math.PI);
      angles.push(angle);
    }

    const perimeter = distances.reduce((sum, d) => sum + d, 0);
    
    // Estimate facets based on angle changes
    const facetCount = angles.filter((a) => a > 30).length + 1;
    
    // Estimate squares (rough calculation: perimeter-based approximation)
    // In production, this would use more sophisticated algorithms
    const estimatedArea = Math.pow(perimeter / 4, 2); // Rough square estimate
    const squares = estimatedArea / 100; // Convert to squares

    setMeasurementData({
      points,
      distances,
      angles,
      perimeter,
      facets: facetCount,
      squares: Math.round(squares * 10) / 10,
    });
    setIsScanning(false);
  };

  const handleStopScan = () => {
    setIsScanning(false);
    if (pointsRef.current.length > 0) {
      calculateMeasurements();
    }
  };

  const handleSaveMeasurement = async () => {
    if (!measurementData || !jobId) {
      Alert.alert("Error", "No measurement data to save");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      
      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      // Send AR measurement to API
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"}/api/jobs/${jobId}/measurements/ar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            measurementData: {
              perimeter: measurementData.perimeter,
              facets: measurementData.facets,
              squares: measurementData.squares,
              points: measurementData.points,
              distances: measurementData.distances,
              angles: measurementData.angles,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save measurement");
      }

      Alert.alert("Success", "AR measurement saved successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save measurement");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AR Roof Scanner</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {!measurementData ? (
          <View style={styles.scanContainer}>
            <Text style={styles.instructions}>
              {isScanning
                ? "Walk around the perimeter of the roof. Keep the device level and steady."
                : "Tap 'Start Scan' and walk around the roof perimeter to measure."}
            </Text>

            {isScanning ? (
              <View style={styles.scanningIndicator}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.scanningText}>
                  Scanning... {pointsRef.current.length} points collected
                </Text>
                <TouchableOpacity
                  onPress={handleStopScan}
                  style={styles.stopButton}
                >
                  <Text style={styles.stopButtonText}>Stop Scan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleStartScan}
                style={styles.startButton}
              >
                <Text style={styles.startButtonText}>Start Scan</Text>
              </TouchableOpacity>
            )}

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>How it works:</Text>
              <Text style={styles.infoText}>
                1. Start the scan{"\n"}
                2. Walk around the roof perimeter{"\n"}
                3. The scanner records points automatically{"\n"}
                4. AI calculates measurements and materials
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Measurement Results</Text>

            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Squares</Text>
              <Text style={styles.resultValue}>{measurementData.squares}</Text>
            </View>

            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Perimeter</Text>
              <Text style={styles.resultValue}>
                {Math.round(measurementData.perimeter)} ft
              </Text>
            </View>

            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Facets</Text>
              <Text style={styles.resultValue}>{measurementData.facets}</Text>
            </View>

            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Points Collected</Text>
              <Text style={styles.resultValue}>{measurementData.points.length}</Text>
            </View>

            <TouchableOpacity
              onPress={handleSaveMeasurement}
              style={styles.saveButton}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Measurement</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setMeasurementData(null);
                pointsRef.current = [];
              }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: "#2563eb",
    fontSize: 16,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  scanContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  instructions: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  scanningIndicator: {
    alignItems: "center",
    gap: 20,
  },
  scanningText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  startButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 40,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  stopButton: {
    backgroundColor: "#dc2626",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
  },
  stopButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "#1a1a1a",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 40,
  },
  infoTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  infoText: {
    color: "#999",
    fontSize: 14,
    lineHeight: 22,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  resultCard: {
    backgroundColor: "#1a1a1a",
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  resultLabel: {
    color: "#999",
    fontSize: 14,
    marginBottom: 8,
  },
  resultValue: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  retryButton: {
    backgroundColor: "transparent",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  retryButtonText: {
    color: "#999",
    fontSize: 16,
  },
});


























