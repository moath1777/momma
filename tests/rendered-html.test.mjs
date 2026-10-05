import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ministryStageAverages } from "../app/maturity-metrics.ts";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the organizational maturity dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /<title>قياس نضج النموذج التشغيلي<\/title>/);
  assert.match(html, /class="maturity-dashboard"/);
  assert.match(html, /class="org-chart"/);
  assert.match(html, /المرتبطة بسمو الوزير/);
  assert.match(html, /الشؤون التنفيذية/);
  assert.match(html, /الجهاز العسكري/);
  assert.match(html, /مستوى الوزارة/);
  assert.match(html, /التصميم/);
  assert.match(html, /البناء المؤسسي/);
  assert.match(html, /التشغيل/);
  assert.match(html, /مستهدف 2026/);
  assert.doesNotMatch(html, /التفعيل/);
});

test("embedded workbook data matches the new Excel structure", async () => {
  const data = JSON.parse(await readFile(new URL("../app/model-data.json", import.meta.url), "utf8"));
  assert.equal(data.groups.length, 3);
  assert.equal(data.stages.length, 3);
  assert.equal(data.units.length, 40);
  assert.equal(data.scores.length, 120);
  assert.equal(data.rows.length, 1200);
  assert.deepEqual(data.groups, ["المرتبطة بسمو الوزير", "الشؤون التنفيذية", "الجهاز العسكري"]);
  assert.deepEqual(data.stages, ["التصميم", "البناء المؤسسي", "التشغيل"]);
  assert.ok(data.rows.every((row) => row.checkpointCode && row.checkpointText));
  assert.ok(data.rows.every((row) => row.verification >= 0 && row.verification <= 100));
  assert.ok(data.rows.every((row) => row.target2026 >= 0 && row.target2026 <= 100));
  assert.ok(data.scores.every((score) => score.target2026 >= 0 && score.target2026 <= 100));
});

test("ministry stages give each group equal weight despite different unit counts", () => {
  const groups = ["minister", "executive", "military"];
  const units = groups.flatMap((group, index) => Array.from({ length: index + 1 }, (_, unit) => ({ code: `${group}-${unit}`, group })));
  const scores = units.flatMap((unit, index) => [
    { unitCode: unit.code, stage: "design", value: [10, 40, 60, 80, 80, 80][index], target2026: [20, 50, 70, 90, 90, 90][index] },
    { unitCode: unit.code, stage: "operation", value: groups.indexOf(unit.group) + 1.49, target2026: groups.indexOf(unit.group) + 11.49 },
  ]);
  const metrics = ministryStageAverages({ groups, units, scores, stages: ["design", "operation"] });
  assert.ok(Math.abs(metrics.design.value - (10 + 50 + 80) / 3) < 1e-10);
  assert.ok(Math.abs(metrics.design.target - (20 + 60 + 90) / 3) < 1e-10);
  assert.ok(Math.abs(metrics.operation.value - 2.49) < 1e-10);
  assert.ok(Math.abs(metrics.operation.target - 12.49) < 1e-10);
});

test("ministry stages show no result when one group has no stage data", () => {
  const data = {
    groups: ["minister", "executive", "military"],
    stages: ["design", "operation"],
    units: [{ code: "a", group: "minister" }, { code: "b", group: "executive" }, { code: "c", group: "military" }],
    scores: [{ unitCode: "a", stage: "design", value: 30, target2026: 60 }, { unitCode: "b", stage: "design", value: 60, target2026: 90 }],
  };
  assert.deepEqual(ministryStageAverages(data), { design: { value: null, target: null }, operation: { value: null, target: null } });
});

test("upload page explains the required workbook sheets", async () => {
  const response = await render("/upload");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /شروط ملف Excel/);
  assert.match(html, /قائمة الوحدات/);
  assert.match(html, /نقاط التحقق/);
  assert.match(html, /ملخص الوحدات/);
  assert.match(html, /درجة المرحلة المستهدفة لعام 2026/);
});
