import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rat,
  rAdd,
  rMul,
  rCmp,
  rMid,
  ratFromNumber,
  hp,
  hpFromNumber,
  hpToNumber,
  rectFromNumber,
  pointInRect,
  segmentsIntersect,
  sightBlockedAtPoint,
  occlusionIntervals,
  analyzePlan,
  cameraAtTime,
  formatNum,
  SCALE,
} from '../src/geometry.js';

/* ---------------- 有理数 ---------------- */

test('有理数规范化与四则运算', () => {
  assert.deepEqual(rat(2n, 4n), { n: 1n, d: 2n });
  assert.deepEqual(rat(3n, -6n), { n: -1n, d: 2n });
  assert.equal(rCmp(rAdd(rat(1n, 3n), rat(1n, 6n)), rat(1n, 2n)), 0);
  assert.equal(rCmp(rMul(rat(2n, 3n), rat(9n, 4n)), rat(3n, 2n)), 0);
  assert.equal(rCmp(rMid(rat(0n), rat(1n)), rat(1n, 2n)), 0);
  assert.equal(rCmp(ratFromNumber(0.25), rat(1n, 4n)), 0);
});

/* ---------------- 线段相交（含相切） ---------------- */

const P = (x, y) => hpFromNumber(x, y);

test('线段相交：交叉、端点接触、共线重叠、不相交', () => {
  // 正常交叉
  assert.equal(segmentsIntersect(P(0, 0), P(4, 4), P(0, 4), P(4, 0)), true);
  // 端点接触（T 形相切）
  assert.equal(segmentsIntersect(P(0, 0), P(4, 0), P(2, 0), P(2, 3)), true);
  // 共线重叠
  assert.equal(segmentsIntersect(P(0, 0), P(4, 0), P(2, 0), P(6, 0)), true);
  // 共线端点相接
  assert.equal(segmentsIntersect(P(0, 0), P(2, 0), P(2, 0), P(5, 0)), true);
  // 共线但分离
  assert.equal(segmentsIntersect(P(0, 0), P(2, 0), P(3, 0), P(5, 0)), false);
  // 平行不相交
  assert.equal(segmentsIntersect(P(0, 0), P(4, 0), P(0, 1), P(4, 1)), false);
  // 延长线相交但线段不相交
  assert.equal(segmentsIntersect(P(0, 0), P(1, 1), P(5, 0), P(6, 1)), false);
});

test('点在闭矩形内（含边界）', () => {
  const R = rectFromNumber(4, 4, 2, 2); // [4,6]×[4,6]
  assert.equal(pointInRect(P(5, 5), R), true);
  assert.equal(pointInRect(P(4, 5), R), true); // 边界
  assert.equal(pointInRect(P(6, 6), R), true); // 顶点
  assert.equal(pointInRect(P(3.999999, 5), R), false);
  assert.equal(pointInRect(P(5, 6.000001), R), false);
});

test('静止视线：相切也算遮挡', () => {
  const R = rectFromNumber(4, 4, 2, 2);
  // 视线穿过矩形
  assert.equal(sightBlockedAtPoint(P(0, 0), P(10, 10), R), true);
  // 视线恰好经过顶点 (4,6)：相切 → 遮挡
  assert.equal(sightBlockedAtPoint(P(0, 3), P(8, 9), R), true);
  // 视线完全避开
  assert.equal(sightBlockedAtPoint(P(0, 0), P(10, 0), R), false);
  // 相机在矩形内
  assert.equal(sightBlockedAtPoint(P(5, 5), P(0, 0), R), true);
});

/* ---------------- 连续遮挡区间（与解析解对比） ---------------- */

test('场景A：遮挡区间精确等于 u∈[1/4, 3/4]', () => {
  // 相机 (0,0)->(10,0)，标记 (5,10)，矩形 [4,6]×[4,6]
  const c0 = hpFromNumber(0, 0);
  const c1 = hpFromNumber(10, 0);
  const M = hpFromNumber(5, 10);
  const R = rectFromNumber(4, 4, 2, 2);
  const ivs = occlusionIntervals(c0, c1, M, R);
  assert.equal(ivs.length, 1);
  assert.equal(rCmp(ivs[0].uStart, rat(1n, 4n)), 0);
  assert.equal(rCmp(ivs[0].uEnd, rat(3n, 4n)), 0);
  assert.equal(ivs[0].tangent, false);
});

test('场景B：相机轨迹擦过矩形顶点 → 仅 u=1/2 瞬时相切', () => {
  // 相机 (0,2)->(8,10) 经过顶点 (4,6)，标记 (0,10)，矩形 [4,6]×[4,6]
  const c0 = hpFromNumber(0, 2);
  const c1 = hpFromNumber(8, 10);
  const M = hpFromNumber(0, 10);
  const R = rectFromNumber(4, 4, 2, 2);
  const ivs = occlusionIntervals(c0, c1, M, R);
  assert.equal(ivs.length, 1);
  assert.equal(rCmp(ivs[0].uStart, rat(1n, 2n)), 0);
  assert.equal(rCmp(ivs[0].uEnd, rat(1n, 2n)), 0);
  assert.equal(ivs[0].tangent, true);
});

test('场景C：全程安全 → 无区间', () => {
  const c0 = hpFromNumber(0, 0);
  const c1 = hpFromNumber(10, 0);
  const M = hpFromNumber(5, -10);
  const R = rectFromNumber(4, 4, 2, 2);
  assert.equal(occlusionIntervals(c0, c1, M, R).length, 0);
});

test('相机全程位于矩形内 → 整段遮挡 [0,1]', () => {
  const c0 = hpFromNumber(4.5, 5);
  const c1 = hpFromNumber(5.5, 5);
  const M = hpFromNumber(0, 0);
  const R = rectFromNumber(4, 4, 2, 2);
  const ivs = occlusionIntervals(c0, c1, M, R);
  assert.equal(ivs.length, 1);
  assert.equal(rCmp(ivs[0].uStart, rat(0n)), 0);
  assert.equal(rCmp(ivs[0].uEnd, rat(1n)), 0);
});

test('相机穿过矩形：遮挡区间为 [1/3, 11/12]（含离开后视线仍被挡的部分）', () => {
  // 相机 (2,5)->(8,5) 穿过矩形 [4,6]×[4,6]：u∈[1/3, 2/3] 相机在矩形内；
  // 之后视线仍被矩形遮挡，直到 u=11/12（相机 (7.5,5)，视线掠过角点 (6,4)）。
  const c0 = hpFromNumber(2, 5);
  const c1 = hpFromNumber(8, 5);
  const M = hpFromNumber(0, 0);
  const R = rectFromNumber(4, 4, 2, 2);
  const ivs = occlusionIntervals(c0, c1, M, R);
  assert.equal(ivs.length, 1);
  assert.equal(rCmp(ivs[0].uStart, rat(1n, 3n)), 0);
  assert.equal(rCmp(ivs[0].uEnd, rat(11n, 12n)), 0);
});

test('标记在矩形另一侧：相机经过标记与矩形之间时不遮挡', () => {
  // 标记 (0,0)，矩形 [4,6]×[-1,1]，相机竖直路径 x=2 在标记与矩形之间
  const c0 = hpFromNumber(2, -10);
  const c1 = hpFromNumber(2, 10);
  const M = hpFromNumber(0, 0);
  const R = rectFromNumber(4, -1, 2, 2);
  assert.equal(occlusionIntervals(c0, c1, M, R).length, 0);
});

test('静止相机（零长度段）也能判定', () => {
  const c0 = hpFromNumber(0, 0);
  const M = hpFromNumber(10, 10);
  const R = rectFromNumber(4, 4, 2, 2);
  const ivs = occlusionIntervals(c0, c0, M, R);
  assert.equal(ivs.length, 1);
  assert.equal(rCmp(ivs[0].uStart, rat(0n)), 0);
  assert.equal(rCmp(ivs[0].uEnd, rat(1n)), 0);
});

/* ---------------- 整体分析 ---------------- */

test('analyzePlan：最早遮挡证据与时间映射', () => {
  const res = analyzePlan({
    keyframes: [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 10, y: 0 },
    ],
    markers: [{ x: 5, y: 10 }],
    rects: [{ x: 4, y: 4, w: 2, h: 2 }],
  });
  assert.equal(res.segments.length, 1);
  const rec = res.segments[0].markers[0].rects[0];
  assert.equal(rCmp(rec.tStart, rat(5n, 2n)), 0); // t = 2.5
  assert.equal(rCmp(rec.tEnd, rat(15n, 2n)), 0); // t = 7.5
  assert.ok(res.earliest);
  assert.equal(rCmp(res.earliest.t, rat(5n, 2n)), 0);
  // 相机位置 (2.5, 0)（经展示转换断言，不依赖内部缩放常数 SCALE）
  const cam = hpToNumber(res.earliest.cam);
  assert.ok(Math.abs(cam.x - 2.5) < 1e-9);
  assert.ok(Math.abs(cam.y) < 1e-9);
});

test('analyzePlan：多段多标记多矩形，取全局最早', () => {
  const res = analyzePlan({
    keyframes: [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 10, y: 0 },
      { t: 20, x: 10, y: 10 },
    ],
    markers: [
      { x: 5, y: 10 },
      { x: 20, y: 5 },
    ],
    rects: [
      { x: 4, y: 4, w: 2, h: 2 },
      { x: 8, y: 2, w: 4, h: 1 },
    ],
  });
  assert.equal(res.segments.length, 2);
  // 段1：M1 被 R1 遮挡（t∈[2.5,7.5]）；M2 (20,5) 的视线也会被 R2 部分遮挡
  // 全局最早应来自段1（任何段2 的遮挡 t ≥ 10）
  assert.ok(res.earliest);
  assert.ok(rCmp(res.earliest.t, rat(10n)) < 0);
});

test('cameraAtTime：浮点插值与钳制', () => {
  const kfs = [
    { t: 0, x: 0, y: 0 },
    { t: 10, x: 10, y: 0 },
    { t: 20, x: 10, y: 10 },
  ];
  assert.deepEqual(cameraAtTime(kfs, 5), { x: 5, y: 0, segIndex: 0 });
  assert.deepEqual(cameraAtTime(kfs, 15), { x: 10, y: 5, segIndex: 1 });
  assert.deepEqual(cameraAtTime(kfs, -1), { x: 0, y: 0, segIndex: 0 });
  assert.deepEqual(cameraAtTime(kfs, 99), { x: 10, y: 10, segIndex: 1 });
});

/* ---------------- 亚微秒时间轴（严格递增可区分性回归） ---------------- */

test('亚微秒时间轴：t=0 与 t=0.0000004 不被截断，最早遮挡精确为 t=0.0000001', () => {
  assert.equal(SCALE, 1_000_000_000_000n);
  // 修复前 SCALE=1e6 时 0.0000004 被取整为 0，两帧塌缩为同一时刻。
  assert.ok(rCmp(ratFromNumber(0.0000004), ratFromNumber(0)) > 0);

  const res = analyzePlan({
    keyframes: [
      { t: 0, x: 0, y: 0 },
      { t: 0.0000004, x: 10, y: 0 },
    ],
    markers: [
      { x: 5, y: 10 },
      { x: 5, y: -10 },
    ],
    rects: [{ x: 4, y: 4, w: 2, h: 2 }],
  });
  assert.equal(res.segments.length, 1);
  // M1(5,10)：段参数 u∈[1/4,3/4] 时视线扫过矩形；M2(5,-10) 全程安全。
  const ivs = res.segments[0].markers[0].rects;
  assert.equal(ivs.length, 1);
  assert.equal(rCmp(ivs[0].uStart, rat(1n, 4n)), 0);
  assert.equal(rCmp(ivs[0].uEnd, rat(3n, 4n)), 0);
  // dt = 0.0000004 = 1/2_500_000，故 t∈[1e-7, 3e-7]
  assert.equal(rCmp(ivs[0].tStart, rat(1n, 10_000_000n)), 0);
  assert.equal(rCmp(ivs[0].tEnd, rat(3n, 10_000_000n)), 0);
  assert.equal(res.segments[0].markers[1].rects.length, 0);
  // 全局最早遮挡必须是非零的 t=0.0000001，相机位于 (2.5, 0)
  assert.ok(res.earliest);
  assert.equal(rCmp(res.earliest.t, rat(1n, 10_000_000n)), 0);
  assert.ok(rCmp(res.earliest.t, ratFromNumber(0.0000004)) < 0);
  const cam = hpToNumber(res.earliest.cam);
  assert.ok(Math.abs(cam.x - 2.5) < 1e-9 && Math.abs(cam.y) < 1e-9);
});

test('formatNum：非零亚微秒结果必须以非零精度展示，不得显示为 0', () => {
  assert.equal(formatNum(0), '0');
  assert.equal(formatNum(0.0000001), '0.0000001');
  assert.equal(formatNum(0.0000004), '0.0000004');
  assert.equal(formatNum(-0.0000001), '-0.0000001');
  assert.equal(formatNum(0.0000000005), '0.0000000005');
  // 常规数值仍保持简洁的至多 4 位小数
  assert.equal(formatNum(2.5), '2.5');
  assert.equal(formatNum(1.4444444), '1.4444');
});
