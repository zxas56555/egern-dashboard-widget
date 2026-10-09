// Standalone Egern generic script. No imports or browser/Node dependencies.
const GIB = 1024 ** 3;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const START_URL = 'egern:/start';
const COLORS = {
  background: { light: '#F0F5F3', dark: '#101E1B' },
  surface: { light: '#DFEAE5', dark: '#20352E' },
  primary: { light: '#152E24', dark: '#F1F7F3' },
  secondary: { light: '#50665A', dark: '#B0C6B9' },
  accent: { light: '#176648', dark: '#9DE1B9' },
  warning: { light: '#8A4114', dark: '#FFBC87' },
};

export function parseUsage(header) {
  if (typeof header !== 'string' || !header.trim()) {
    throw new Error('订阅未提供流量信息');
  }
  const values = {};
  for (const part of header.split(';')) {
    const match = part.trim().match(/^(upload|download|total|expire)\s*=\s*(\d+)$/i);
    if (!match && /^(upload|download|total|expire)\s*=/i.test(part.trim())) {
      throw new Error('订阅流量信息格式异常');
    }
    if (match) {
      const key = match[1].toLowerCase();
      const value = Number(match[2]);
      if (!Number.isSafeInteger(value) || values[key] !== undefined) {
        throw new Error('订阅流量信息格式异常');
      }
      values[key] = value;
    }
  }
  if (['upload', 'download', 'total'].some((key) => values[key] === undefined)) {
    throw new Error('订阅流量信息不完整');
  }
  const used = values.upload + values.download;
  if (!Number.isSafeInteger(used)) {
    throw new Error('订阅流量数值异常');
  }
  const expiresAt = values.expire ? values.expire * 1000 : null;
  if (expiresAt !== null && !Number.isFinite(new Date(expiresAt).getTime())) {
    throw new Error('订阅到期时间异常');
  }
  return {
    upload: values.upload,
    download: values.download,
    total: values.total,
    used,
    remaining: values.total > 0 ? Math.max(0, values.total - used) : null,
    fraction: values.total > 0 ? Math.min(1, used / values.total) : null,
    expiresAt,
  };
}

export function formatBytes(bytes) {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = bytes > 0 ? Math.min(5, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function boundedNumber(value, fallback, min, max) {
  const number = value === undefined || value === '' ? fallback : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function calendar(now, offset = 8) {
  const local = new Date(now + offset * 60 * MINUTE);
  const month = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][local.getUTCDay()];
  return {
    label: `${month}月${day}日 周${weekday}`,
    short: `${month}/${day}`,
    full: `${local.getUTCFullYear()}/${month}/${day}`,
    nextMidnight:
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), day + 1) -
      offset * 60 * MINUTE,
  };
}

// Cache is scoped to the exact subscription and request user agent.
// The URL itself is never written to persistent storage.
function cacheKey(url, userAgent) {
  let first = 2166136261;
  let second = 5381;
  for (const character of `${url}\n${userAgent}`) {
    first = Math.imul(first ^ character.charCodeAt(0), 16777619);
    second = Math.imul(second, 33) ^ character.charCodeAt(0);
  }
  return `egern-dashboard:v1:${first >>> 0}:${second >>> 0}`;
}

function readCache(storage, key) {
  try {
    const cached = JSON.parse(storage?.get(key) || 'null');
    if (
      cached &&
      Number.isFinite(cached.updatedAt) &&
      typeof cached.header === 'string'
    ) {
      return { usage: parseUsage(cached.header), updatedAt: cached.updatedAt };
    }
  } catch {
    // Invalid cache must not prevent a fresh request.
  }
  return null;
}

function getHeader(response) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error('订阅请求失败');
  }
  const headers = response.headers;
  if (typeof headers?.get === 'function') {
    return headers.get('subscription-userinfo');
  }
  const key = Object.keys(headers || {}).find(
    (name) => name.toLowerCase() === 'subscription-userinfo',
  );
  return key ? headers[key] : null;
}

export async function loadSubscription(ctx, now = Date.now()) {
  const env = ctx.env || {};
  if (env.DEMO === 'true') {
    return {
      usage: parseUsage(
        `upload=${2 * GIB}; download=${36.5 * GIB}; total=${200 * GIB}; ` +
          `expire=${Math.floor((now + 28 * DAY) / 1000)}`,
      ),
      updatedAt: now,
      message: '演示数据',
      stale: false,
    };
  }
  const url = (env.SUBSCRIPTION_URL || '').trim();
  if (!url) {
    return { usage: null, message: '请配置订阅地址', stale: false };
  }
  if (!/^https:\/\/[^\s]+$/i.test(url)) {
    return { usage: null, message: '订阅地址需使用 HTTPS', stale: false };
  }
  const userAgent = env.USER_AGENT || 'Egern';
  const key = cacheKey(url, userAgent);
  const cached = readCache(ctx.storage, key);
  const interval = boundedNumber(env.REFRESH_MINUTES, 15, 5, 1440) * MINUTE;
  if (cached && now >= cached.updatedAt && now - cached.updatedAt < interval) {
    return { ...cached, message: '缓存数据', stale: false };
  }
  const options = {
    timeout: 6000,
    headers: { 'User-Agent': userAgent },
    credentials: 'omit',
  };
  try {
    let header;
    try {
      header = getHeader(await ctx.http.head(url, options));
      parseUsage(header);
    } catch {
      // Some providers only return usage headers with GET.
      header = getHeader(await ctx.http.get(url, options));
    }
    const usage = parseUsage(header);
    try {
      ctx.storage?.set(key, JSON.stringify({ header, updatedAt: now }));
    } catch {
      // A storage failure should not hide successfully loaded data.
    }
    return { usage, updatedAt: now, message: '已更新', stale: false };
  } catch {
    // Do not render exception messages: they may contain a subscription token.
    return cached
      ? { ...cached, message: '更新失败 · 上次数据', stale: true }
      : { usage: null, message: '无法读取流量 · 检查订阅', stale: true };
  }
}

function text(value, size = 12, color = COLORS.primary, weight = 'regular') {
  return {
    type: 'text',
    text: value,
    font: { size, weight },
    textColor: color,
    maxLines: 1,
    minScale: 0.7,
  };
}

function stack(children, properties = {}) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children,
    ...properties,
  };
}

function symbol(name, color = COLORS.accent, size = 14) {
  return {
    type: 'image',
    src: `sf-symbol:${name}`,
    color,
    width: size,
    height: size,
  };
}

function powerButton(compact = false) {
  return stack([symbol('power'), text('开启 VPN', 12, COLORS.accent, 'semibold')], {
    url: START_URL,
    height: compact ? 32 : 44,
    padding: [0, 10, 0, 10],
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  });
}

function progress(fraction, width) {
  // Avoid a literal # in an inline data URI: it becomes a URL fragment.
  const track = 'rgb(70,99,84)';
  const fill = fraction >= 0.9 ? 'rgb(222,154,100)' : 'rgb(113,186,145)';
  const amount = Math.max(0, Math.min(1, fraction ?? 0));
  const svg = [
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} 5'>`,
    `<rect width='${width}' height='5' rx='2.5' fill='${track}'/>`,
    `<rect width='${width * amount}' height='5' rx='2.5' fill='${fill}'/>`,
    '</svg>',
  ].join('');
  return { type: 'image', src: `data:image/svg+xml,${svg}`, width, height: 5 };
}

function expiryLabel(usage, now, offset) {
  if (!usage?.expiresAt) {
    return '到期时间未知';
  }
  if (usage.expiresAt <= now) {
    return '订阅已到期';
  }
  const days = Math.ceil((usage.expiresAt - now) / DAY);
  return `${calendar(usage.expiresAt, offset).full} · 剩${days}天`;
}

export function renderDashboard(
  data,
  env = {},
  family = 'systemMedium',
  now = Date.now(),
) {
  const offset = boundedNumber(env.TIMEZONE_OFFSET, 8, -12, 14);
  const date = calendar(now, offset);
  const usage = data.usage;
  const compact = family === 'systemSmall';
  const large = family === 'systemLarge' || family === 'systemExtraLarge';
  const lock = family.startsWith('accessory');
  const warning =
    data.stale ||
    usage?.fraction >= 0.9 ||
    (usage?.expiresAt != null && usage.expiresAt <= now);
  const remaining = formatBytes(usage?.remaining ?? null);
  const title = env.SUBSCRIPTION_NAME || '我的订阅';
  const node = env.NODE_NAME || '未设置';
  const interval = boundedNumber(env.REFRESH_MINUTES, 15, 5, 1440) * MINUTE;
  const expiryRefresh = usage?.expiresAt > now ? usage.expiresAt : Infinity;
  const root = {
    type: 'widget',
    padding: lock ? 0 : 12,
    gap: 4,
    refreshAfter: new Date(
      Math.min(now + interval, date.nextMidnight, expiryRefresh),
    ).toISOString(),
    ...(lock ? {} : { backgroundColor: COLORS.background }),
    children: [],
  };
  if (lock) {
    root.url = START_URL;
    const lockColor = '#FFFFFF';
    if (family === 'accessoryInline') {
      root.children = [
        text(`${date.short} · 余 ${remaining} · ${data.message}`, 12, lockColor),
      ];
    } else if (family === 'accessoryCircular') {
      root.children = [
        stack(
          [
            symbol('power', lockColor, 18),
            text(usage ? remaining : '未配置', 11, lockColor, 'semibold'),
            text(
              data.stale ? '上次数据' : data.message === '演示数据' ? '演示' : '开启 VPN',
              10,
              lockColor,
            ),
          ],
          { direction: 'column', alignItems: 'center', gap: 3, flex: 1 },
        ),
      ];
    } else {
      root.children = [
        text(`${title} · ${date.short}`, 12, lockColor, 'semibold'),
        text(`剩余 ${remaining} · ${data.message}`, 12, lockColor),
        text('轻点开启 VPN', 11, lockColor),
      ];
    }
    return root;
  }
  root.children.push(
    stack([
      text(title, 12, COLORS.primary, 'semibold'),
      { type: 'spacer' },
      text(compact ? date.short : date.label, 11, COLORS.secondary),
    ]),
  );
  const metric = stack(
    [
      text('剩余流量', 11, COLORS.secondary),
      text(remaining, large ? 34 : 25, COLORS.primary, 'semibold'),
      text(
        usage
          ? `已用 ${formatBytes(usage.used)} / ${usage.total > 0 ? formatBytes(usage.total) : '额度未知'}`
          : data.message,
        10,
        warning ? COLORS.warning : COLORS.secondary,
      ),
      progress(usage?.fraction, compact ? 126 : 168),
      ...(compact && usage
        ? [text(data.message, 10, warning ? COLORS.warning : COLORS.secondary)]
        : []),
    ],
    { direction: 'column', alignItems: 'start', gap: 3 },
  );
  const metadata = stack(
    [
      text('节点名称 · 手动配置', 10, COLORS.secondary),
      text(node, 13, COLORS.primary, 'semibold'),
      text(expiryLabel(usage, now, offset), 10, COLORS.secondary),
    ],
    { direction: 'column', alignItems: 'start', flex: 1, gap: 5 },
  );
  root.children.push(
    compact || large
      ? metric
      : stack([metric, { type: 'spacer', length: 10 }, metadata], {
          alignItems: 'start',
        }),
  );
  if (large) {
    root.children.push(
      { type: 'spacer', length: 12 },
      metadata,
      { type: 'spacer', length: 8 },
      stack([
        text(`上传 ${formatBytes(usage?.upload ?? null)}`, 12, COLORS.secondary),
        { type: 'spacer' },
        text(`下载 ${formatBytes(usage?.download ?? null)}`, 12, COLORS.secondary),
      ]),
    );
  }
  root.children.push({ type: 'spacer' });
  if (compact) {
    // iOS small widgets have a single tap target, so the whole widget starts VPN.
    root.url = START_URL;
    root.children.push(powerButton(true));
  } else {
    const status = stack(
      [
        text(data.message, 10, warning ? COLORS.warning : COLORS.secondary),
        ...(data.updatedAt
          ? [
              {
                type: 'date',
                date: new Date(data.updatedAt).toISOString(),
                format: 'relative',
                font: { size: 10 },
                textColor: COLORS.secondary,
                maxLines: 1,
              },
            ]
          : []),
      ],
      { direction: 'column', alignItems: 'start', gap: 3, flex: 1 },
    );
    root.children.push(stack([status, powerButton()]));
  }
  return root;
}

export default async function dashboard(ctx) {
  const now = Date.now();
  const data = await loadSubscription(ctx, now);
  return renderDashboard(data, ctx.env || {}, ctx.widgetFamily || 'systemMedium', now);
}
