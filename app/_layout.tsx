import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initializeNotifications, requestNotificationPermissions } from '../src/core/notifications/notification.service';
import { schedule_default_reminders } from '../src/tools/automation/task-scheduler';
import { colors } from '../src/ui/theme';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const init = async () => {
      try {
        await initializeNotifications();
        const granted = await requestNotificationPermissions();
        if (granted) {
          try {
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
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
