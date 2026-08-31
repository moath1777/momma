import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
