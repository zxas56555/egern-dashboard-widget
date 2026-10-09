import test from 'node:test';
import assert from 'node:assert/strict';
import dashboard, {
  calendar,
  formatBytes,
  loadSubscription,
  parseUsage,
  renderDashboard,
} from '../src/dashboard.js';

const NOW = Date.parse('2026-10-09T04:00:00Z');
const HEADER = 'upload=10;download=30;total=100;expire=1800000000';

function context(env = {}, header = HEADER) {
  const entries = new Map();
  const calls = [];
  return {
    env,
    calls,
    storage: {
      get: (key) => entries.get(key) ?? null,
      set: (key, value) => entries.set(key, value),
    },
    http: {
      head: async (url) => {
        calls.push(['HEAD', url]);
        return { status: 200, headers: new Headers({ 'Subscription-Userinfo': header }) };
      },
      get: async (url) => {
        calls.push(['GET', url]);
        return { status: 200, headers: new Headers({ 'Subscription-Userinfo': header }) };
      },
    },
  };
}

function texts(widget) {
  return [widget.text || '', ...(widget.children || []).flatMap(texts)].filter(Boolean);
}

test('parses case-insensitive usage with or without spaces', () => {
  const usage = parseUsage('Download = 30;UPLOAD=10; total=100; expire=0');
  assert.equal(usage.used, 40);
  assert.equal(usage.remaining, 60);
  assert.equal(usage.fraction, 0.4);
  assert.equal(usage.expiresAt, null);
});

test('rejects incomplete, malformed, duplicate and unsafe numbers', () => {
  for (const header of [
    '',
    'upload=0;download=10',
    'upload=-1;download=10;total=100',
    'upload=1.5;download=10;total=100',
    'upload=1;download=10;total=100;expire=invalid',
    'upload=1;upload=2;download=10;total=100',
    'upload=9007199254740992;download=10;total=100',
    'upload=9007199254740991;download=10;total=100',
  ]) {
    assert.throws(() => parseUsage(header));
  }
});

test('clamps overage and treats zero quota as unknown', () => {
  assert.equal(parseUsage('upload=0;download=200;total=100').remaining, 0);
  assert.equal(parseUsage('upload=0;download=200;total=100').fraction, 1);
  assert.equal(parseUsage('upload=0;download=200;total=0').remaining, null);
  assert.equal(formatBytes(null), '—');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024 ** 3), '1.0 GB');
});

test('date follows configured offset and refreshes at midnight', () => {
  const result = calendar(Date.parse('2026-10-09T16:01:00Z'), 8);
  assert.equal(result.label, '10月10日 周六');
  assert.equal(result.nextMidnight, Date.parse('2026-10-10T16:00:00Z'));
});

test('missing configuration never fetches or displays demo data', async () => {
  const ctx = context();
  const result = await loadSubscription(ctx, NOW);
  assert.equal(result.usage, null);
  assert.match(result.message, /配置/);
  assert.equal(ctx.calls.length, 0);
  await loadSubscription(context({ DEMO: 'true' }), NOW);
});

test('HEAD success caches usage; another subscription uses a separate cache', async () => {
  const ctx = context({ SUBSCRIPTION_URL: 'https://example.com/a?token=private' });
  const first = await loadSubscription(ctx, NOW);
  assert.equal(first.usage.used, 40);
  await loadSubscription(ctx, NOW + 1000);
  assert.equal(ctx.calls.length, 1);
  ctx.env.SUBSCRIPTION_URL = 'https://example.com/b';
  await loadSubscription(ctx, NOW + 2000);
  assert.equal(ctx.calls.length, 2);
});

test('falls back to GET for missing headers or unsupported HEAD', async () => {
  for (const status of [200, 405]) {
    const ctx = context({ SUBSCRIPTION_URL: 'https://example.com/a' });
    ctx.http.head = async () => ({ status, headers: new Headers() });
    const result = await loadSubscription(ctx, NOW);
    assert.equal(result.usage.used, 40);
    assert.equal(ctx.calls[0][0], 'GET');
  }
});

test('network failures show stale data and never expose URLs or tokens', async () => {
  const ctx = context({ SUBSCRIPTION_URL: 'https://example.com/a?token=private' });
  await loadSubscription(ctx, NOW);
  ctx.http.head = ctx.http.get = async () => {
    throw new Error('https://example.com/a?token=private');
  };
  const result = await loadSubscription(ctx, NOW + 16 * 60000);
  assert.equal(result.stale, true);
  assert.equal(result.updatedAt, NOW);
  assert.equal(result.usage.used, 40);
  assert.doesNotMatch(JSON.stringify(result), /private/);
  ctx.env.SUBSCRIPTION_URL = 'https://example.com/new';
  assert.equal((await loadSubscription(ctx, NOW)).usage, null);
});

test('bad storage does not prevent a valid fetch', async () => {
  const ctx = context({ SUBSCRIPTION_URL: 'https://example.com/a' });
  ctx.storage.get = () => '{invalid';
  ctx.storage.set = () => {
    throw new Error('disk full');
  };
  assert.equal((await loadSubscription(ctx, NOW)).usage.used, 40);
});

test('renders all widget families as serializable DSL and provides VPN entry', () => {
  const data = { usage: parseUsage(HEADER), updatedAt: NOW, message: '已更新' };
  const families = [
    'systemSmall',
    'systemMedium',
    'systemLarge',
    'systemExtraLarge',
    'accessoryCircular',
    'accessoryRectangular',
    'accessoryInline',
  ];
  for (const family of families) {
    const widget = renderDashboard(data, {}, family, NOW);
    assert.equal(widget.type, 'widget');
    assert.ok(new Date(widget.refreshAfter).getTime() > NOW);
    assert.ok(JSON.stringify(widget).includes('egern:/start'));
    assert.ok(texts(widget).some((text) => text.includes('60 B')));
  }
});

test('expiry, quota unknown and missing data are explicit', () => {
  const expired = parseUsage('upload=10;download=30;total=100;expire=1');
  assert.ok(
    texts(renderDashboard({ usage: expired }, {}, 'systemMedium', NOW)).includes(
      '订阅已到期',
    ),
  );
  const unknown = parseUsage('upload=10;download=30;total=0;expire=0');
  assert.ok(
    texts(renderDashboard({ usage: unknown }, {}, 'systemMedium', NOW)).includes(
      '到期时间未知',
    ),
  );
  const missing = renderDashboard(
    { usage: null, message: '请配置订阅地址' },
    {},
    'systemMedium',
    NOW,
  );
  assert.ok(texts(missing).includes('请配置订阅地址'));
});

test('entry function produces a widget from Egern context', async () => {
  const result = await dashboard(context({ DEMO: 'true' }));
  assert.equal(result.type, 'widget');
  assert.ok(texts(result).includes('演示数据'));
});
