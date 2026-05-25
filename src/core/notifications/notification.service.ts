import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { captureError } from '../logger/logger';

let initialized = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function initializeNotifications(): Promise<boolean> {
  if (initialized) return true;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('wealth-manager-reminders', {
        name: '记账提醒',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD700',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('wealth-manager-alerts', {
        name: '预算与安全告警',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: '#FF4444',
        sound: 'default',
        bypassDnd: true,
      });

      await Notifications.setNotificationChannelAsync('wealth-manager-achievements', {
        name: '成就通知',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#44FF44',
        sound: 'default',
      });
    }

    initialized = true;
    return true;
  } catch (e) {
    captureError('NotificationService.initialize', e, 'Failed to initialize notifications');
    return false;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (e) {
    captureError('NotificationService.requestPermissions', e, 'Failed to request permissions');
    return false;
  }
}

export async function getNotificationPermissionStatus(): Promise<{
  permission: string;
  canSchedule: boolean;
  androidChannels?: string[];
}> {
  try {
    if (!initialized) {
      await initializeNotifications();
    }

    const { status } = await Notifications.getPermissionsAsync();
    const channels: string[] = [];

    if (Platform.OS === 'android') {
      const reminders = await Notifications.getNotificationChannelAsync('wealth-manager-reminders');
      const alerts = await Notifications.getNotificationChannelAsync('wealth-manager-alerts');
      const achievements = await Notifications.getNotificationChannelAsync('wealth-manager-achievements');

      if (reminders) channels.push('wealth-manager-reminders');
      if (alerts) channels.push('wealth-manager-alerts');
      if (achievements) channels.push('wealth-manager-achievements');
    }

    return {
      permission: status,
      canSchedule: status === 'granted',
      androidChannels: channels.length > 0 ? channels : undefined,
    };
  } catch {
    return {
      permission: 'unknown',
      canSchedule: false,
    };
  }
}

export async function scheduleNotification(params: {
  title: string;
  body: string;
  triggerAt: string;
  channelId?: string;
  data?: Record<string, unknown>;
}): Promise<{ scheduled: boolean; notificationId?: string }> {
  try {
    if (!initialized) {
      await initializeNotifications();
    }

    const triggerDate = new Date(params.triggerAt);
    const now = new Date();

    if (triggerDate.getTime() <= now.getTime()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: params.title,
          body: params.body,
          sound: 'default',
          data: params.data || {},
        },
        trigger: null,
      });
      return { scheduled: true, notificationId: 'immediate' };
    }

    const secondsUntilTrigger = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        sound: 'default',
        data: params.data || {},
        ...(Platform.OS === 'android' && params.channelId
          ? { channelId: params.channelId }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilTrigger,
      },
    });

    return { scheduled: true, notificationId: identifier };
  } catch (e) {
    captureError('NotificationService.scheduleNotification', e, 'Failed to schedule notification');
    return { scheduled: false };
  }
}

export async function scheduleDailyNotification(params: {
  title: string;
  body: string;
  hour: number;
  minute: number;
  channelId?: string;
  data?: Record<string, unknown>;
  identifier?: string;
}): Promise<{ scheduled: boolean; notificationId?: string }> {
  try {
    if (!initialized) {
      await initializeNotifications();
    }

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        sound: 'default',
        data: params.data || {},
        ...(Platform.OS === 'android' && params.channelId
          ? { channelId: params.channelId }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: params.hour,
        minute: params.minute,
      },
    });

    return { scheduled: true, notificationId: identifier };
  } catch (e) {
    captureError('NotificationService.scheduleDailyNotification', e, 'Failed to schedule daily');
    return { scheduled: false };
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    captureError('NotificationService.cancelAll', e, 'Failed to cancel notifications');
  }
}

export async function cancelNotification(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (e) {
    captureError('NotificationService.cancelNotification', e, 'Failed to cancel notification');
  }
}

export async function getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return [];
  }
}

export { Notifications };
