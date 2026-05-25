import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { initializeNotifications, requestNotificationPermissions } from '../src/core/notifications/notification.service';
import { schedule_default_reminders } from '../src/tools/automation/task-scheduler';

export default function RootLayout() {
  useEffect(() => {
    const init = async () => {
      await initializeNotifications();
      const granted = await requestNotificationPermissions();
      if (granted) {
        await schedule_default_reminders();
      }
    };
    init();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a1a' },
        }}
      />
    </>
  );
}
