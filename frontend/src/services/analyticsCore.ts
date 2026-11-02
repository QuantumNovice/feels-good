import type { CaptureResult, PostHogConfig } from 'posthog-js';
import { APP_ID, APP_NAME } from '../brand';

const categories = [
  'all',
  'bathroom',
  'parking',
  'date',
  'tourism',
  'popup',
  'event',
];
const schema = {
  app_opened: {},
  category_selected: { category: categories },
  map_view_changed: { mode: ['overview', 'local'] },
  place_selected: {
    category: categories,
    origin: ['personal', 'bundled', 'imported'],
  },
  place_details_opened: { category: categories },
  place_added: { category: categories },
  place_edited: { category: categories },
  place_saved: { category: categories },
  place_unsaved: { category: categories },
  navigation_opened: { category: categories },
  navigation_requested: {
    provider: ['pleos', 'google', 'naver', 'kakao', 'geo', 'other'],
  },
  source_import_requested: { source_type: ['https', 'osm'] },
  source_reset: {},
  search_opened: {},
  region_selected: {},
  location_requested: {},
  saved_filter_changed: { enabled: 'boolean' },
  places_list_toggled: { open: 'boolean' },
  language_changed: { language: ['en', 'ko', 'ja'] },
} as const;
export type AnalyticsEvent = keyof typeof schema;
type SafeProperties = Record<string, string | boolean>;
type Context = {
  platform: 'web' | 'android';
  app_version: string;
  environment: 'production' | 'development';
  language: string;
};
export type AnalyticsSettings = { token: string; host: string };
export type AnalyticsEnvironment = {
  VITE_POSTHOG_PROJECT_TOKEN?: string;
  VITE_POSTHOG_HOST?: string;
  VITE_POSTHOG_ENABLED?: string;
  VITE_POSTHOG_CAPTURE_IN_DEV?: string;
};
export interface AnalyticsSdk {
  init(token: string, config: Partial<PostHogConfig>): unknown;
  capture(event: string, properties: SafeProperties): unknown;
}

export function analyticsSettings(
  env: AnalyticsEnvironment,
  production: boolean,
): AnalyticsSettings | undefined {
  const token = env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
  if (
    !token ||
    env.VITE_POSTHOG_ENABLED === 'false' ||
    (!production && env.VITE_POSTHOG_CAPTURE_IN_DEV !== 'true')
  )
    return;
  // Personal API keys grant account access and must never be shipped in this client.
  if (token.startsWith('phx_') || /\s|[<>]/.test(token)) return;
  try {
    const host = new URL(
      env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com',
    );
    if (
      host.protocol !== 'https:' ||
      host.username ||
      host.password ||
      host.search ||
      host.hash
    )
      return;
    return { token, host: host.href.replace(/\/$/, '') };
  } catch {
    return;
  }
}

function eventProperties(
  event: string,
  properties: Record<string, unknown>,
): SafeProperties | undefined {
  if (!Object.hasOwn(schema, event)) return;
  const result: SafeProperties = {};
  for (const [key, rule] of Object.entries(schema[event as AnalyticsEvent])) {
    const value = properties[key];
    if (
      rule === 'boolean'
        ? typeof value === 'boolean'
        : typeof value === 'string' &&
          (rule as readonly string[]).includes(value)
    )
      result[key] = value as string | boolean;
  }
  return result;
}

/** Final SDK boundary: also remove automatic URLs, referrers and person properties. */
export function scrubAnalyticsEvent(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event) return null;
  const safe = eventProperties(event.event, event.properties);
  if (!safe) return null;
  const properties: Record<string, unknown> = {
    ...safe,
    app_id: APP_ID,
    app_name: APP_NAME,
    $geoip_disable: true,
  };
  for (const key of [
    'token',
    'distinct_id',
    '$device_id',
    '$session_id',
    '$window_id',
    '$lib',
    '$lib_version',
    '$insert_id',
    '$time',
    '$sent_at',
    '$process_person_profile',
    '$is_identified',
  ]) {
    const value = event.properties[key];
    if (['string', 'number', 'boolean'].includes(typeof value))
      properties[key] = value;
  }
  if (['web', 'android'].includes(event.properties.platform))
    properties.platform = event.properties.platform;
  if (['production', 'development'].includes(event.properties.environment))
    properties.environment = event.properties.environment;
  if (['en', 'ko', 'ja'].includes(event.properties.language))
    properties.language = event.properties.language;
  if (
    /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(event.properties.app_version || '')
  )
    properties.app_version = event.properties.app_version;
  return {
    uuid: event.uuid,
    event: event.event,
    timestamp: event.timestamp,
    properties,
  };
}

/** A bounded startup queue; analytics failure never interrupts map or persistence. */
export function createAnalytics(
  settings: AnalyticsSettings | undefined,
  loadSdk: () => Promise<AnalyticsSdk>,
  context: () => Context,
) {
  let client: AnalyticsSdk | undefined;
  let initialization: Promise<void> | undefined;
  let failed = false;
  const pending: { event: AnalyticsEvent; properties: SafeProperties }[] = [];
  const send = (event: AnalyticsEvent, properties: SafeProperties) => {
    try {
      client?.capture(event, {
        ...properties,
        ...context(),
        app_id: APP_ID,
        app_name: APP_NAME,
      });
    } catch {
      /* Best effort. */
    }
  };
  function track(
    event: AnalyticsEvent,
    properties: Record<string, unknown> = {},
  ) {
    if (!settings || failed) return;
    const safe = eventProperties(event, properties);
    if (!safe) return;
    if (client) send(event, safe);
    else if (pending.length < 50) pending.push({ event, properties: safe });
  }
  function init(): Promise<void> {
    if (!settings) return Promise.resolve();
    return (initialization ??= Promise.resolve()
      .then(loadSdk)
      .then((sdk) => {
        sdk.init(settings.token, {
          api_host: settings.host,
          defaults: '2026-08-30',
          persistence: 'localStorage',
          person_profiles: 'never',
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          capture_dead_clicks: false,
          capture_heatmaps: false,
          capture_exceptions: false,
          capture_performance: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_conversations: true,
          disable_product_tours: true,
          disable_external_dependency_loading: true,
          advanced_disable_flags: true,
          save_campaign_params: false,
          save_referrer: false,
          ip: false,
          respect_dnt: true,
          before_send: scrubAnalyticsEvent,
        });
        client = sdk;
        send('app_opened', {});
        for (const item of pending.splice(0)) send(item.event, item.properties);
      })
      .catch(() => {
        failed = true;
        pending.length = 0;
        console.warn(
          'Usage analytics could not initialize; the app remains available.',
        );
      }));
  }
  return { init, track };
}
