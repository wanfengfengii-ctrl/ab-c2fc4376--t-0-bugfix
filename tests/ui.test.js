/**
 * ui.test.js —— 无头 UI 冒烟：用最小 DOM 桩加载 main.js，
 * 驱动「校核」按钮并验证横幅/结果/画布链路，以及一次拖拽编辑。
 * 精确性断言在 geometry.test.js，这里只验证 UI 接线正确。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/* ---------------- 最小 DOM 桩 ---------------- */

const ctx2d = new Proxy(
  {},
  {
    get: (t, p) => (typeof p === 'string' ? () => {} : undefined),
    set: () => true,
  },
);

function makeEl(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    value: '0',
    min: '0',
    max: '10',
    step: '0.01',
    disabled: false,
    textContent: '',
    className: '',
    innerHTML: '',
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) {
      (this.listeners[ev] ??= []).push(fn);
    },
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 980, height: 620 };
    },
    getContext() {
      return ctx2d;
    },
    closest() {
      return null;
    },
    fire(ev, event = {}) {
      for (const fn of this.listeners[ev] || []) fn(event);
    },
  };
}

const els = new Map();
const getEl = (sel) => {
  if (!els.has(sel)) els.set(sel, makeEl(sel === '#view' ? 'canvas' : 'div'));
  return els.get(sel);
};

globalThis.document = {
  querySelector: (sel) => getEl(sel),
};
globalThis.window = { devicePixelRatio: 1 };
globalThis.requestAnimationFrame = () => 0;

// 加载被测模块（模块级会执行 setupCanvas + renderAll）
await import('../src/main.js');

const fire = (sel, ev, event) => getEl(sel).fire(ev, event);

/* ---------------- 测试 ---------------- */

test('初始渲染：面板与结果占位', () => {
  assert.ok(getEl('#panel-keyframes').innerHTML.includes('K1'));
  assert.ok(getEl('#panel-markers').innerHTML.includes('M1'));
  assert.ok(getEl('#panel-rects').innerHTML.includes('R1'));
  assert.ok(getEl('#results').innerHTML.includes('尚未校核'));
});

test('点击校核：默认示例存在遮挡 → 立即报告不可执行与首个证据', () => {
  fire('#btn-verify', 'click');
  const banner = getEl('#banner');
  assert.equal(banner.className, 'banner bad');
  assert.ok(banner.textContent.includes('曝光不可执行'));
  assert.ok(banner.textContent.includes('最早遮挡'));
  const results = getEl('#results').innerHTML;
  assert.ok(results.includes('首个遮挡证据'));
  assert.ok(results.includes('K1 → K2'));
  assert.ok(results.includes('M1'));
  assert.ok(results.includes('R1'));
  // 时间轴已定位到最早遮挡时刻（默认示例为 t = 13/9 ≈ 1.444，
  // 相机位于 (210,120)，视线恰好擦过 R1 左下角 (300,300)）
  const t = parseFloat(getEl('#scrub').value);
  assert.ok(t > 1.4 && t < 1.5, `viewTime 应定位到最早遮挡附近，实际 ${t}`);
});

test('录入非法（标记落入矩形）→ 校核给出错误而非结论', () => {
  // 通过面板 input 事件把 M1 挪进 R1 内部
  const markerRow = getEl('#panel-markers').innerHTML.match(/data-id="(\d+)"/);
  assert.ok(markerRow, '应能找到标记点输入框');
  const id = markerRow[1];
  const aside = getEl('aside');
  aside.fire('input', { target: { dataset: { kind: 'marker', id, field: 'x' }, value: '310' } });
  aside.fire('input', { target: { dataset: { kind: 'marker', id, field: 'y' }, value: '210' } });
  const results = getEl('#results').innerHTML;
  assert.ok(results.includes('输入不合法'));
  assert.ok(results.includes('落在保护矩形'));
  assert.ok(getEl('#banner').textContent.includes('输入不合法'));
});

test('拖动画布实体后自动复核', () => {
  const canvas = getEl('#view');
  // 把位于 (310,210) 的标记拖回安全位置 (360,420)
  canvas.fire('pointerdown', { clientX: 310, clientY: 210, pointerId: 1 });
  canvas.fire('pointermove', { clientX: 360, clientY: 420, pointerId: 1 });
  canvas.fire('pointerup', { pointerId: 1 });
  // 自动复核后应恢复「曝光不可执行」结论（默认场景仍有其他遮挡）
  assert.equal(getEl('#banner').className, 'banner bad');
  assert.ok(getEl('#results').innerHTML.includes('首个遮挡证据'));
});

test('重置示例回到未校核状态', () => {
  fire('#btn-reset', 'click');
  assert.ok(getEl('#results').innerHTML.includes('尚未校核'));
  assert.equal(getEl('#banner').className, 'banner hidden');
});

test('亚微秒方案：首个遮挡报告非零 t=0.0000001 并以非零精度展示', () => {
  const aside = getEl('aside');
  const clickBtn = (dataset) =>
    aside.fire('click', { target: { dataset, closest: () => ({ dataset }) } });
  const setField = (kind, id, field, value) =>
    aside.fire('input', { target: { dataset: { kind, id, field }, value } });
  const idsIn = (sel) =>
    [...new Set([...getEl(sel).innerHTML.matchAll(/data-id="(\d+)"/g)].map((m) => m[1]))];

  // 默认示例为 3 关键帧 / 3 标记 / 2 矩形，删到验收场景所需的 2 / 2 / 1
  const kfIds = idsIn('#panel-keyframes');
  clickBtn({ action: 'del', kind: 'keyframe', id: kfIds[2] });
  const mkIds = idsIn('#panel-markers');
  clickBtn({ action: 'del', kind: 'marker', id: mkIds[2] });
  const rcIds = idsIn('#panel-rects');
  clickBtn({ action: 'del', kind: 'rect', id: rcIds[1] });

  // 关键帧：t=0 (0,0) → t=0.0000004 (10,0)
  const kf2 = idsIn('#panel-keyframes');
  setField('keyframe', kf2[0], 't', '0');
  setField('keyframe', kf2[0], 'x', '0');
  setField('keyframe', kf2[0], 'y', '0');
  setField('keyframe', kf2[1], 't', '0.0000004');
  setField('keyframe', kf2[1], 'x', '10');
  setField('keyframe', kf2[1], 'y', '0');

  // 标记 (5,10) 与 (5,-10)
  const mk2 = idsIn('#panel-markers');
  setField('marker', mk2[0], 'x', '5');
  setField('marker', mk2[0], 'y', '10');
  setField('marker', mk2[1], 'x', '5');
  setField('marker', mk2[1], 'y', '-10');

  // 保护矩形 x=4 y=4 w=2 h=2
  const rc2 = idsIn('#panel-rects');
  setField('rect', rc2[0], 'x', '4');
  setField('rect', rc2[0], 'y', '4');
  setField('rect', rc2[0], 'w', '2');
  setField('rect', rc2[0], 'h', '2');

  fire('#btn-verify', 'click');

  const banner = getEl('#banner');
  assert.equal(banner.className, 'banner bad');
  assert.ok(banner.textContent.includes('0.0000001'), `横幅应显示非零时刻：${banner.textContent}`);
  assert.ok(!/t = 0(?!\.)|t = 0$/.test(banner.textContent));
  const results = getEl('#results').innerHTML;
  assert.ok(results.includes('首个遮挡证据'));
  assert.ok(results.includes('0.0000001'), '结果区应以非零精度展示首个遮挡时刻');

  // 时间轴已精确定位到 t=0.0000001，标签非零展示，步长足以区分该时刻
  const scrub = getEl('#scrub');
  assert.ok(Math.abs(parseFloat(scrub.value) - 1e-7) < 1e-12, `scrub 定位异常：${scrub.value}`);
  assert.ok(parseFloat(scrub.step) < 1e-7, `scrub 步长过粗：${scrub.step}`);
  assert.equal(getEl('#time-label').textContent, 't = 0.0000001');
});
