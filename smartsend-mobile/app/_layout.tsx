import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { registerForPushNotifications, setupNotificationListeners } from '@/lib/notifications';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Set up push notifications
    registerForPushNotifications();
    setupNotificationListeners();

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return null; // You can add a loading screen here
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {session ? (
        <>
          <Stack.Screen name="(tabs)" />
        </>
      ) : (
        <Stack.Screen name="login" />
      )}
    </Stack>
  );
}


























