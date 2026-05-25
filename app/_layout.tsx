import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const init = async () => {
      try {
        const { initializeNotifications, requestNotificationPermissions } =
          await import('../src/core/notifications/notification.service');
        await initializeNotifications();
        const granted = await requestNotificationPermissions();
        if (granted) {
          try {
            const { schedule_default_reminders } =
              await import('../src/tools/automation/task-scheduler');
            await schedule_default_reminders();
          } catch {
            // 非关键路径，静默失败
          }
        }
      } catch {
        // 通知初始化失败不阻止 App 启动
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
