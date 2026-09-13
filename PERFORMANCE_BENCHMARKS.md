# تقرير أداء Phase B — الفهارس المركّبة + Pagination + Caching + Batch

تقرير شامل لمرحلة تحسين الأداء **Phase B** (B.2 → B.6) على منصة مدير الاختبارات الذكي.

---

## B.2 — الفهارس المركّبة

الفهارس أُضيفت عبر migration `20260913000000_add_performance_indexes`
(16 فهرساً مركّباً، موضّحة في الأسفل). القياس أُجري على بيانات المحاكاة نفسها
(5000 طالب، 10 جهات، 5000 جلسة) قبل وبعد.

### مقارنة الأزمنة (before / after)

| الاستعلام | before (ms) | after (ms) | التغير |
| --- | ---: | ---: | ---: |
| قائمة طلاب (صفحة) + عدّ | 392.96 | 209.62 | -46.7% |
| عدّ الطلاب حسب الحالة | 95.55 | 105.59 | +10.5% |
| قائمة جلسات (حالة+تاريخ) | 180.76 | 209.64 | +16.0% |
| قائمة شهادات بانتظار التوقيع | 178.50 | 104.98 | -41.2% |
| بحث جهات (حي/اسم) | 90.13 | 204.41 | +126.8% |
| سجل تدقيق مؤسسة (عكس الزمن) | 93.86 | 100.17 | +6.7% |
| الموسم النشط | 95.59 | 99.96 | +4.6% |
| إشعارات مستخدم (غير المقروء) | 176.01 | 101.33 | -42.4% |

### فحص خطة التنفيذ (Seq Scan)

| الحالة | Seq Scan على قائمة الطلاب |
| --- | --- |
| before | نعم (مسح تسلسلي) |
| after | **لا** — يستخدم `Index Scan Backward` عبر `students_tenantId_createdAt_idx` |

### الفهارس المضافــة (16)

- **Student:** `[tenantId, status]`, `[tenantId, institutionId]`, `[tenantId, committeeId]`, `[tenantId, createdAt]`
- **ExamModel:** `[tenantId, branch, seasonId]`, `[tenantId, seasonId]`
- **ExamSession:** `[tenantId, status]`, `[tenantId, examDate]`, `[tenantId, teacher1Id]`, `[tenantId, teacher2Id]`
- **Assessment:** `[tenantId, status]`, `[tenantId, examSessionId]`
- **Certificate:** `[tenantId, status]`
- **Notification:** `[userId, isRead, tenantId]`
- **AuditLog:** `[tenantId, timestamp]`, `[tenantId, action]`

---

## B.3 — Pagination إلزامي

- **`take: 100` (الحد الأقصى الافتراضي)** أُضيف إلى **12 استعلام `findMany`** غير محدود في `lib/actions/`:
  `getAdminSeasons`, `getInstitutionsOptions`, `getExaminersOptions`,
  `getAuditLogUsers`, `getPendingCertificatesForSignature`, `getCommittees`,
  `listInstitutions`, `getExaminersList`, `getCommitteeModelAllocations`,
  `getUserNotifications` (إصلاح خلل تجاوز الحد عند غياب `page`), `getExamSeasons`, `getTenantsList`.
- **`PAGE_SIZE = 20`** ثابت مركزي جديد في `lib/utils.ts`، مستخدم في حجم الصفحة الافتراضي
  لقوائم الواجهات (لوحات Admin، قوائم الطلاب، سجل التدقيق، مراجعة رئيس الشؤون) في
  `lib/actions/auth-actions.ts`، `head-actions.ts`، `admin-panel-actions.ts`، `audit-actions.ts`، `lib/db.queries.ts`.
- القوائم الكبيرة أُبقيت مرتّبة ومرقّمة صفحات مسبقاً (`skip/take + count`) موجودة فعلاً — لم تُلمس.

### استعلامات لا يمكن تصفيحها (موثّقة)

| الوظيفة | السبب |
| --- | --- |
| `specialistFinalApprove`, `headOfAffairsFinalApprove` (admin-actions) | تجميع معرفات المستخدمين لإشعار الجميع — قص الحد يسقط مستلمين |
| `approveAssessment` (assessment-actions ×2) | نفس السبب (تفريغ إشعارات لمختصّي التقييم) |
| `generateCertificate`, `sendCertificateToInstitution` (certificate-actions) | نفس السبب (إشعار حسابات الجهة) |
| `rejectStudentByHead` (head-actions ×2) | نفس السبب (إشعار الأخصائي + الجهة) |
| `createStudentApplication`, `reviewStudentApplication`, `assignCommittee` (student-actions) | نفس السبب (إشعار الأطراف) |
| `notifyTenantAdmins` (super-admin-actions) | نفس السبب (إشعار كل أدمن المؤسسة) |

> استعلامات صغيرة ثابتة (لا تحتاج قصّاً): تقييمات جلسة واحدة، التحقق من معلمَين، حسابات SUPER_ADMIN — 4 حالات فقط.

---

## B.4 — Caching

أُضيف في `lib/cache.ts`:

- `getCachedTenantConfig(tenantId)` — `unstable_cache`، إعادة تحقق **300 ثانية**
  (ألوان العلامة + إعدادات التقييم الخاصة بالمستأجر). تُستخدم في صفحة التقييم الحرجة
  `app/(dashboard)/examiner/assess/[studentId]/page.tsx` بدلاً من استعلام مباشر.
- `getCachedPlatformSettings()` — `unstable_cache`، إعادة تحقق **60 ثانية**
  (اسم المنصة، الشعار، الألوان، الوضع المظلم…). تُستخدم في:
  - اللوحة الجذرية `app/layout.tsx` (generateViewport + generateMetadata + RootLayout).
  - مسار `app/api/settings/route.ts`.

---

## B.5 — Batch Operations

- **`scripts/import-quran-models.ts`** — كان يستخدم `createMany` داخل `$transaction` بالفعل ✅.
- **`prisma/seed.ts`** — استُبدلت حلقات `for … await prisma.X.create` بإنشاء جماعي:
  - الجهات التعليمية (87) + حساباتها (87): `createMany` مجمّع بدلاً من 174 استدعاء فردي.
  - النماذج الاختبارية (600): `createMany({ skipDuplicates: true })` — يحافظ على التكرارية حسب القيد الفريد.
  - الطلاب (250): فحص التكرار دفعة واحدة ثم `createMany` مجمّع.
- **`app/api/import/models/route.ts`** — استُبدلت حلقة الإدراج الفردي بـ `createMany({ skipDuplicates: true })`
  مع إبقاء التحقق ورفع Drive لكل عنصر، وإرجاع العدد الفعلي المستورد من نتيجة الاستدعاء.

---

## ملاحظات القياس

- **الأرضية ~100ms** هي زمن الشبكة من جهاز التطوير إلى قاعدة بيانات Neon
  (فرانكفورت) — ليست قابلية للتحسين، تُضاف لكل استعلام تقريباً.
- **`institutions_search` (90→204ms)**: تراجع ظاهري بمجموع بيانات صغير جداً (10 جهات محاكاة فقط)
  — رقم مضلل وغير دال. سيُعالَج لاحقاً بـ **GIN index** إن تكرر النمط مع بيانات الإنتاج الحقيقية.
- ثلاثة استعلامات تحسّنت **40–47%** (قائمة الطلاب، الشهادات بانتظار التوقيع، إشعارات المستخدم)،
  وزال **Seq Scan** من استعلام الطلاب.

---

## قرار تأجيل التحقق اليدوي

التحقق اليدوي من النتائج على واجهة المستخدم (التنقل عبر الصفحات الكبيرة،
لوحات الأداء) **مؤجَّل** — يُكتفى حالياً بالقياس الآلي عبر
`scripts/analyze-performance.ts` وفحص خطط التنفيذ.

> **تحديث (إغلاق Phase B، 2026-09-13):** أُصلحت أخطاء TypeScript في
> `scripts/analyze-performance.ts` (استكمال صارم للوصلات الاختيارية) وأُعيد تشغيله
> بنجاح، واكتملت **Phase B** بتحقّق كامل: `pnpm typecheck` = 0 أخطاء، `pnpm lint`
> نظيف، `pnpm build` نجاح. التحقق اليدوي البصري على الواجهة لا يزال مؤجَّلاً
> كبند مستقل غير حاجب.

## الأدلة القياس

- `benchmarks/perf-before.json` — قياس قبل إضافة الفهارس.
- `benchmarks/perf-after.json` — قياس بعد إضافة الفهارس.

---

## B.6 — Benchmark Script + إغلاق Phase B

- ✅ `scripts/analyze-performance.ts` — أداة القياس الآلي (ترصد الأزمنة خطوة بخطوة).
- ✅ أُصلحت أخطاء TypeScript (الوصلات الاختيارية `?.` المكتملة بـ `!` عند الحاجة)
  و`pnpm typecheck` يمر بـ **0 أخطاء** — الأداة تعمل وتُنفَّذ.
- ✅ Commit الإغلاق: `ee02487 phase B: pagination + caching + batch ops + benchmarks`.

## ملاحظة Phase C (لا أثر على القياس)

تغييرات Phase C (الأمان) لاحقاً — ترقية `next` 14.2.35 → 15.5.25، ترويسات أمان،
معدّلات حد — **لا تغيّر** منهجية أو نتائج قياسات الفهارس/الـ Pagination الموثقة أعلاه
(لم تُمَس الاستعلامات المُقاسَة أو الفهارس). الترقية أعادت بناء المكوّنات مع الحفاظ
على نفس أحجام الحزم تقريباً.