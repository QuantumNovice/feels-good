import { APP_VERSION } from '../brand';
import { analyticsSettings, createAnalytics } from './analyticsCore';

const analytics = createAnalytics(
  analyticsSettings(import.meta.env, import.meta.env.PROD),
  async () => (await import('posthog-js/no-external')).default,
  () => ({
    platform: window.Spotlane ? 'android' : 'web',
    app_version: APP_VERSION,
    environment: import.meta.env.PROD ? 'production' : 'development',
    language: document.documentElement.lang || 'en',
  }),
);
export const initAnalytics = analytics.init;
export const track = analytics.track;
