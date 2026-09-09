import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

// ============================================================
// اختبار تكاملي لطبقة الاستعلامات (lib/db.queries) على قاعدة حيّة.
// يعمل فقط عند توفر DATABASE_URL (بذر مسبق متوقع).
// ============================================================

const hasDb = !!process.env.DATABASE_URL;

async function loadQueries() {
  return import("../../lib/db.queries");
}

test("db.queries: makeSkip يحسب الإزاحة من رقم الصفحة", async () => {
  const { makeSkip } = await loadQueries();
  assert.equal(makeSkip(1, 20), 0);
  assert.equal(makeSkip(2, 20), 20);
  assert.equal(makeSkip(5, 10), 40);
  assert.equal(makeSkip(0, 20), 0, "صفحات أقل من 1 تُسوّى إلى 1");
});

test(
  "db.queries: ترقيح طلبات الطلاب يصحّح العدد وعدد الصفحات",
  { skip: !hasDb && "DATABASE_URL غير مزوّد (يتطلب بذر قاعدة حيّة)" },
  async () => {
    const { getStudentsPage } = await loadQueries();
    const page = await getStudentsPage({ page: 1, pageSize: 25 });
    assert.ok(Array.isArray(page.students));
    assert.ok(page.students.length <= 25, "لا يتجاوز حجم الصفحة");
    assert.ok(page.total >= page.students.length);
    assert.equal(page.totalPages, Math.ceil(page.total / 25));

    const page2 = await getStudentsPage({ page: 2, pageSize: 25 });
    if (page.total > 25) {
      assert.ok(page2.students.length > 0, "الصفحة الثانية ليست فارغة مع وجود بيانات");
    }
  }
);

test(
  "db.queries: عدادات لوحة التحكم تُرجع أرقاماً غير سالبة",
  { skip: !hasDb && "DATABASE_URL غير مزوّد" },
  async () => {
    const { getDashboardCounters } = await loadQueries();
    const c = await getDashboardCounters();
    assert.ok(c.students >= 0);
    assert.ok(c.institutions >= 0);
    assert.ok(c.sessions >= 0);
    assert.ok(c.completed >= 0);
  }
);

test(
  "db.queries: خيارات المعلمين تُرجع معرّفات وأسماء فقط",
  { skip: !hasDb && "DATABASE_URL غير مزوّد" },
  async () => {
    const { getExaminerOptions } = await loadQueries();
    const options = await getExaminerOptions();
    for (const o of options) {
      assert.equal(typeof o.id, "string");
      assert.equal(typeof o.name, "string");
    }
  }
);

test(
  "db.queries: نماذج الصفحة تأتي من الفرع المطلوب فقط",
  { skip: !hasDb && "DATABASE_URL غير مزوّد" },
  async () => {
    const { getExamModelsPage } = await loadQueries();
    const page = await getExamModelsPage({ page: 1, pageSize: 20, branch: "5" });
    assert.ok(Array.isArray(page.models));
    for (const m of page.models) {
      assert.equal(m.branch, "5", "كل النماذج المعادة من الفرع المطلوب");
    }
  }
);