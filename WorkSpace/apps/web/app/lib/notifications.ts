"use client";

let notificationPermission: NotificationPermission = 'default';

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[Notifications] Not supported in this browser');
    return false;
  }

  if (Notification.permission === 'granted') {
    notificationPermission = 'granted';
    return true;
  }

  if (Notification.permission === 'denied') {
    notificationPermission = 'denied';
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    return permission === 'granted';
  } catch (err) {
    console.error('[Notifications] Failed to request permission:', err);
    return false;
  }
}

export function showNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window)) {
    console.warn('[Notifications] Not supported');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.warn('[Notifications] Permission not granted');
    return;
  }

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      requireInteraction: false,
      ...options,
    });

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);

    return notification;
  } catch (err) {
    console.error('[Notifications] Failed to show:', err);
  }
}

export function notifyApprovalCreated(approval: any) {
  showNotification('🔔 New Trade Approval', {
    body: `${approval.title || 'Trade'} requires your approval: ${approval.coin} ${approval.amount}`,
    tag: 'approval',
    requireInteraction: true, // Don't auto-dismiss approvals
  });
}

export function notifyCriticalAlert(alert: any) {
  showNotification('🚨 Critical Alert', {
    body: alert.message,
    tag: 'alert-critical',
    requireInteraction: true,
  });
}

export function notifyKillSwitchChanged(enabled: boolean, reason?: string) {
  showNotification(
    enabled ? '🚨 Kill Switch Activated' : '✅ Trading Resumed',
    {
      body: reason || (enabled ? 'All trading stopped' : 'Trading operations resumed'),
      tag: 'killswitch',
    }
  );
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}
