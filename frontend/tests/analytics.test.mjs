import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledModule } from './load-module.mjs';
const { analyticsSettings, createAnalytics, scrubAnalyticsEvent } =
  await import(compiledModule('../src/services/analyticsCore.ts'));
const env = {
  VITE_POSTHOG_PROJECT_TOKEN: 'phc_test_project_token',
  VITE_POSTHOG_HOST: 'https://eu.i.posthog.com',
};
const context = () => ({
  platform: 'web',
  app_version: '0.2.0',
  environment: 'production',
  language: 'en',
});

test('analytics requires a project token and explicit development opt-in; invalid/private credentials stay off', () => {
  assert.equal(analyticsSettings({}, true), undefined);
  assert.equal(analyticsSettings(env, false), undefined);
  assert.equal(
    analyticsSettings({ ...env, VITE_POSTHOG_ENABLED: 'false' }, true),
    undefined,
  );
  assert.deepEqual(
    analyticsSettings({ ...env, VITE_POSTHOG_CAPTURE_IN_DEV: 'true' }, false),
    { token: env.VITE_POSTHOG_PROJECT_TOKEN, host: env.VITE_POSTHOG_HOST },
  );
  assert.equal(
    analyticsSettings(
      { ...env, VITE_POSTHOG_PROJECT_TOKEN: 'phx_private_personal_key' },
      true,
    ),
    undefined,
  );
  for (const host of [
    'http://example.com',
    'https://name:secret@example.com',
    'https://example.com/?token=secret',
    'not a host',
  ])
    assert.equal(
      analyticsSettings({ ...env, VITE_POSTHOG_HOST: host }, true),
      undefined,
    );
  assert.equal(
    analyticsSettings(
      { ...env, VITE_POSTHOG_HOST: 'https://analytics.example.org/ingest/' },
      true,
    ).host,
    'https://analytics.example.org/ingest',
  );
});

test('unconfigured analytics never loads the SDK or sends events', async () => {
  let loaded = false;
  const analytics = createAnalytics(
    undefined,
    async () => {
      loaded = true;
      throw Error('must not load');
    },
    context,
  );
  analytics.track('place_added', { category: 'tourism' });
  await analytics.init();
  assert.equal(loaded, false);
});

test('configured analytics initializes once, disables automatic capture, and bounds the startup queue', async () => {
  let loads = 0,
    config;
  const captured = [];
  const analytics = createAnalytics(
    analyticsSettings(env, true),
    async () => {
      loads++;
      return {
        init: (token, options) => {
          assert.equal(token, env.VITE_POSTHOG_PROJECT_TOKEN);
          config = options;
        },
        capture: (event, properties) => captured.push({ event, properties }),
      };
    },
    context,
  );
  for (let i = 0; i < 70; i++)
    analytics.track('category_selected', {
      category: 'tourism',
      latitude: 37.5,
      note: 'private',
    });
  await Promise.all([analytics.init(), analytics.init()]);
  assert.equal(loads, 1);
  assert.equal(captured.length, 51);
  assert.equal(captured[0].event, 'app_opened');
  assert.deepEqual(captured[1].properties, {
    category: 'tourism',
    ...context(),
    app_id: 'com.brightideas.spotlane',
    app_name: '느좋 neu-joh',
  });
  assert.equal(config.autocapture, false);
  assert.equal(config.capture_pageview, false);
  assert.equal(config.disable_session_recording, true);
  assert.equal(config.disable_external_dependency_loading, true);
  assert.equal(config.advanced_disable_flags, true);
  assert.equal(config.person_profiles, 'never');
  assert.equal(config.respect_dnt, true);
  analytics.track('place_saved', { category: 'parking' });
  assert.equal(captured.at(-1).event, 'place_saved');
});

test('the SDK boundary removes source/user text, coordinates, URLs and person profiles', () => {
  const raw = {
    uuid: 'event-id',
    event: 'place_added',
    timestamp: new Date(),
    $set: { email: 'private@example.org' },
    $set_once: { initial_url: 'private' },
    properties: {
      category: 'bathroom',
      name: 'Home',
      address: 'My address',
      latitude: 37.5,
      longitude: 127,
      notes: 'Sensitive text',
      query: 'Home',
      source_url: 'https://example.org/secret',
      $current_url: 'https://example.org/?address=private',
      $referrer: 'https://private.example.org',
      $set: { email: 'private@example.org' },
      $set_once: { name: 'Private' },
      distinct_id: 'anonymous-id',
      token: env.VITE_POSTHOG_PROJECT_TOKEN,
      $session_id: 'session-id',
      ...context(),
    },
  };
  const event = scrubAnalyticsEvent(raw);
  assert.deepEqual(event.properties, {
    category: 'bathroom',
    app_id: 'com.brightideas.spotlane',
    app_name: '느좋 neu-joh',
    $geoip_disable: true,
    distinct_id: 'anonymous-id',
    token: env.VITE_POSTHOG_PROJECT_TOKEN,
    $session_id: 'session-id',
    ...context(),
  });
  assert.equal(event.$set, undefined);
  assert.equal(event.$set_once, undefined);
  assert.equal(scrubAnalyticsEvent({ ...raw, event: '$autocapture' }), null);
  assert.equal(
    scrubAnalyticsEvent({ ...raw, event: 'unapproved_event' }),
    null,
  );
  assert.equal(
    scrubAnalyticsEvent({ ...raw, properties: { category: 'My home address' } })
      .properties.category,
    undefined,
  );
  assert.equal(raw.properties.name, 'Home');
});

test('web and Android events always identify this app in a shared project, including queued events and SDK scrubbing', async () => {
  for (const platform of ['web', 'android']) {
    const captured = [];
    let beforeSend;
    const analytics = createAnalytics(
      analyticsSettings(env, true),
      async () => ({
        init(_token, config) {
          beforeSend = config.before_send;
        },
        capture(event, properties) {
          captured.push(beforeSend({ event, properties }));
        },
      }),
      () => ({ ...context(), platform, app_id: 'another-app' }),
    );
    analytics.track('category_selected', {
      category: 'date',
      app_id: 'another-app',
    });
    await analytics.init();
    analytics.track('place_saved', {
      category: 'parking',
      app_name: 'Another app',
    });
    assert.deepEqual(
      captured.map((event) => event.event),
      ['app_opened', 'category_selected', 'place_saved'],
    );
    for (const event of captured) {
      assert.equal(event.properties.app_id, 'com.brightideas.spotlane');
      assert.equal(event.properties.app_name, '느좋 neu-joh');
      assert.equal(event.properties.platform, platform);
    }
  }
  for (const properties of [
    {},
    { app_id: 'another-app', app_name: 'Another app' },
  ]) {
    const event = scrubAnalyticsEvent({ event: 'app_opened', properties });
    assert.equal(event.properties.app_id, 'com.brightideas.spotlane');
    assert.equal(event.properties.app_name, '느좋 neu-joh');
  }
});

test('SDK loading/capture failure never rejects into application actions', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const analytics = createAnalytics(
      analyticsSettings(env, true),
      async () => {
        throw Error('offline');
      },
      context,
    );
    analytics.track('place_added', { category: 'tourism' });
    await assert.doesNotReject(analytics.init());
    assert.doesNotThrow(() => analytics.track('place_saved'));
    const captureFails = createAnalytics(
      analyticsSettings(env, true),
      async () => ({
        init() {},
        capture() {
          throw Error('blocked');
        },
      }),
      context,
    );
    await assert.doesNotReject(captureFails.init());
    assert.doesNotThrow(() => captureFails.track('place_added'));
  } finally {
    console.warn = warn;
  }
});
