import { api } from './client';

/** Web Push on this device (same flow as the Todo app). */
export interface PushConfig {
  enabled: boolean;
  public_key: string | null;
  /** How many of your devices get notifications. */
  devices: number;
}

export function pushConfig() {
  return api<PushConfig>('/api/push/config');
}

// ------------------------------------------------------------------ this device

export type PushState = 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied' | 'server-off';

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function pushState(): Promise<PushState> {
  const config = await api<PushConfig>('/api/push/config');
  if (!config.enabled) return 'server-off';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iOS only offers push to installed web apps.
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/** Asks for permission, subscribes this browser and registers it with the server. */
export async function enablePush(language: string): Promise<PushState> {
  const config = await api<PushConfig>('/api/push/config');
  if (!config.enabled || !config.public_key) return 'server-off';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.public_key) }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api('/api/push/subscriptions', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys, language },
  });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  }
  return 'off';
}

export function sendTestPush() {
  return api<{ sent: number }>('/api/push/test', { method: 'POST' });
}
