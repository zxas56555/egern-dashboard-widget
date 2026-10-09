import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import dashboard from '../src/dashboard.js';

const source = await readFile(new URL('../dist/dashboard.js', import.meta.url), 'utf8');
const moduleFile = await readFile(
  new URL('../config/module.yaml', import.meta.url),
  'utf8',
);

test('published script exposes only the documented default entry', () => {
  assert.match(source, /^export default async function \(ctx\)/m);
  assert.equal((source.match(/^export /gm) || []).length, 1);
  assert.doesNotMatch(source, /^import /m);
  assert.match(moduleFile, /script_url: .*\/dist\/dashboard\.js\?v=0\.1\.1/);
});

test('published script executes after removing the default export declaration', async () => {
  // This is a compatibility smoke test, not an emulation of Egern's engine.
  const executable = source.replace(
    'export default async function',
    'const entry = async function',
  );
  const entry = new Script(`${executable}\nentry;`).runInNewContext();
  for (const env of [{}, { DEMO: 'true' }]) {
    const ctx = { env, widgetFamily: 'systemMedium' };
    const widget = await entry(ctx);
    assert.equal(widget.type, 'widget');
    assert.ok(widget.children.length > 0);
    const serialized = JSON.stringify(widget);
    assert.ok(serialized.includes(env.DEMO ? '演示数据' : '请配置订阅地址'));
    assert.ok(serialized.includes('egern:/start'));
  }
});

test('published entry matches source entry with an actual mocked subscription response', async () => {
  const published = await import('../dist/dashboard.js');
  const ctx = {
    env: { SUBSCRIPTION_URL: 'https://example.com/subscription' },
    http: {
      head: async () => ({
        status: 200,
        headers: new Headers({
          'subscription-userinfo': 'upload=0; download=1073741824; total=2147483648',
        }),
      }),
    },
  };
  const expected = await dashboard(ctx);
  const actual = await published.default(ctx);
  assert.equal(actual.type, expected.type);
  assert.ok(JSON.stringify(actual).includes('1.0 GB'));
  assert.doesNotMatch(JSON.stringify(actual), /无法读取/);
});
