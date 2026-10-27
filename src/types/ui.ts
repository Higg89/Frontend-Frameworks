export type ThemeMode = 'light' | 'dark';

export type NotificationTone = 'positive' | 'negative' | 'info';

export interface AppNotification {
  id: number;
  message: string;
  tone: NotificationTone;
}
