import { parseUsage, renderDashboard } from '/dashboard.js';

const widget = document.querySelector('#widget');
const controls = document.querySelector('#controls');
const feedback = document.querySelector('#feedback');
const sizes = {
  systemSmall: [158, 170],
  systemMedium: [338, 170],
  systemLarge: [338, 354],
  systemExtraLarge: [500, 354],
  accessoryRectangular: [180, 72],
  accessoryCircular: [76, 76],
  accessoryInline: [300, 28],
};
const weights = { regular: 400, medium: 500, semibold: 600, bold: 700 };

function actionFeedback(url) {
  feedback.textContent =
    url === 'egern:/stop'
      ? '关闭操作：跳转至 egern:/stop，由 Egern 执行停止 VPN。'
      : '开启操作：跳转至 egern:/start，由 Egern 执行启动 VPN。';
}

function resolveColor(value, theme) {
  return typeof value === 'object' ? value[theme] : value;
}

function render(element, theme) {
  const action = element.url;
  const tag = action ? 'button' : element.type === 'image' ? 'img' : 'div';
  const node = document.createElement(tag);
  node.className = `dsl-${element.type}`;
  if (action) {
    node.type = 'button';
    node.classList.add('dsl-action');
    node.addEventListener('click', () => {
      actionFeedback(action);
    });
  }
  if (element.type === 'stack' || element.type === 'widget') {
    node.style.display = 'flex';
    node.style.flexDirection = element.direction === 'row' ? 'row' : 'column';
    node.style.alignItems =
      { start: 'flex-start', end: 'flex-end' }[element.alignItems] ||
      (element.type === 'widget' ? 'stretch' : 'center');
    node.style.gap = `${element.gap || 0}px`;
    for (const child of element.children || []) {
      node.append(render(child, theme));
    }
  }
  if (element.type === 'text' || element.type === 'date') {
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(element.date)) / 60000),
    );
    node.textContent =
      element.type === 'date'
        ? elapsedMinutes < 1
          ? '刚刚'
          : `${elapsedMinutes}分钟前`
        : element.text;
    node.className = 'dsl-text';
    node.style.color = resolveColor(element.textColor, theme);
    node.style.fontSize = `${element.font?.size || 12}px`;
    node.style.fontWeight = weights[element.font?.weight] || 400;
  }
  if (element.type === 'image') {
    node.alt = '';
    if (element.src.startsWith('data:')) {
      node.src = element.src;
    } else {
      const color = resolveColor(element.color, theme);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>
        <path d='M12 2v10M6 5a9 9 0 1 0 12 0' fill='none'
          stroke='${color}' stroke-width='2' stroke-linecap='round'/></svg>`;
      node.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
  }
  if (element.type === 'spacer') {
    if (element.length) {
      node.style.flex = `0 0 ${element.length}px`;
    } else {
      node.style.flex = '1';
    }
  }
  for (const key of ['width', 'height', 'borderRadius']) {
    if (element[key]) {
      node.style[key] = `${element[key]}px`;
    }
  }
  if (element.height) {
    node.style.minHeight = `${element.height}px`;
  }
  if (element.flex) {
    node.style.flex = `${element.flex}`;
  }
  if (element.padding !== undefined) {
    node.style.padding = Array.isArray(element.padding)
      ? element.padding.map((value) => `${value}px`).join(' ')
      : `${element.padding}px`;
  }
  if (element.backgroundColor) {
    node.style.backgroundColor = resolveColor(element.backgroundColor, theme);
  }
  return node;
}

function update() {
  const family = document.querySelector('#family').value;
  const theme = document.querySelector('#theme').value;
  const scenario = document.querySelector('#scenario').value;
  const now = Date.now();
  const gib = 1024 ** 3;
  const used = scenario === 'over' ? 230 : 38.5;
  const expire = now + (scenario === 'expired' ? -1 : 28) * 86400000;
  const total = scenario === 'unknown' ? 0 : 200 * gib;
  const header =
    `upload=${2 * gib}; download=${(used - 2) * gib}; ` +
    `total=${total}; expire=${scenario === 'unknown' ? 0 : Math.floor(expire / 1000)}`;
  const data = {
    usage: scenario === 'missing' ? null : parseUsage(header),
    updatedAt: scenario === 'missing' ? null : scenario === 'stale' ? now - 7200000 : now,
    stale: scenario === 'stale',
    message:
      scenario === 'missing'
        ? '请配置订阅地址'
        : scenario === 'stale'
          ? '更新失败 · 上次数据'
          : '演示数据',
  };
  const env = {
    SUBSCRIPTION_NAME: document.querySelector('#name').value,
  };
  const dsl = renderDashboard(data, env, family, now);
  const rendered = render(dsl, theme);
  widget.replaceChildren(...rendered.childNodes);
  widget.style.cssText = rendered.style.cssText;
  const [width, height] = sizes[family];
  const available = widget.parentElement.clientWidth - 16;
  widget.style.width = `${Math.min(width, available)}px`;
  widget.style.height = `${height}px`;
  widget.style.borderRadius = family === 'accessoryCircular' ? '50%' : '22px';
  widget.style.backgroundColor = family.startsWith('accessory')
    ? '#20352E'
    : resolveColor(dsl.backgroundColor, theme);
  widget.onclick = dsl.url
    ? () => {
        actionFeedback(dsl.url);
      }
    : null;
  widget.tabIndex = dsl.url ? 0 : -1;
  widget.onkeydown = dsl.url
    ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          widget.click();
        }
      }
    : null;
  feedback.textContent = '演示数据 · 浏览器近似预览，最终效果以 iOS 为准。';
}

controls.addEventListener('input', update);
controls.addEventListener('submit', (event) => event.preventDefault());
window.addEventListener('resize', update);
update();
