import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return null;
  }

  token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('Push token:', token);

  // Register token with backend
  await registerDeviceToken(token);

  return token;
}

async function registerDeviceToken(token: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('No user logged in');
      return;
    }

    // Register token with backend API
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(`${apiUrl}/api/mobile/registerDevice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        user_id: user.id,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to register device token');
    }

    console.log('Device token registered successfully');
  } catch (error) {
    console.error('Error registering device token:', error);
  }
}

export function setupNotificationListeners() {
  // Handle notifications received while app is in foreground
  Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification);
  });

  // Handle notification taps
  Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Notification tapped:', response);
    const data = response.notification.request.content.data;
    
    // Navigate based on notification type
    if (data?.type === 'hot_lead' && data?.lead_id) {
      // Navigate to lead details
      // You'll need to import your navigation here
    }
  });
}


























