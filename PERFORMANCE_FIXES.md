# PERFORMANCE_FIXES.md

تقرير التحسينات الجذرية في الأداء قبل وبعد — منصة مدير الاختبارات الذكي.

## الموجز

| المنطقة | قبل | بعد |
| --- | --- | --- |
| إعدادات المنصة (`app_settings`) | استعلام `upsert` لكل استدعاء (لوحة + دخول + إطلاق شهادات) | استعلام واحد لكل طلب عبر `React.cache` |
| لوحة الأدمن | 16 عدّاً متتالياً على اتصال واحد + 1 عدّ منفصل | جميعها في `Promise.all` واحد (موازية) |
| Pusher | استثناء/403 عند غياب الإعدادات في بيئة التطوير | تعطيل هادئ (no-op) — لا فشل صاخب ولا 403 |
| المقيّمون/النماذج | جلب متكرر | `getCachedExaminers` / `getCachedExamModels` (مخزّنة) |

## 1) تخزين إعدادات المنصة (React.cache)

- **الملف:** `lib/actions/settings-actions.ts`
- `getPlatformSettings()` الآن مغلّفة بـ `cache()` من React.
- **الأثر:** تُستدعى مرات عدة في الطلب الواحد (اللوحة، صفحة الدخول، `/api/settings`، إطلاق الشهادات، زر المنصة) — قبل استدعاءٌ متكرر لأمر `upsert` على قاعدة البيانات، والآن استعلام واحد لكل طلب يتم مشاركته بين كل المستدعين داخل نفس الطلب.
- كل عمليات التحديث تستدعي `revalidatePath` تلقائياً فيُحدث الكاش مع الحفظ.

## 2) توحيد عدّادات لوحة الأدمن (Promise.all)

- **الملف:** `lib/actions/admin-panel-actions.ts` — `getAdminDashboardStats`
- جميع عمليات العد (المستخدمون، الجهات، الطلاب، المعلمون، المواسم، الجلسات، القادمة، المكتملة، المعلقة، المقبولة، المرفوضة، الشهادات، النماذج، الجاهزة، المُصدرة، الإشعارات) في `Promise.all` واحد (16 استعلاماً متوازياً).
- **الأثر:** زمن الاستجابة ≈ زمن أبطأ استعلام بدل مجموعها كلها.

## 3) إصلاح خطأ Pusher 403

- **الملف:** `lib/realtime.ts`
- `getServer()` كان يرمي استثناءً عند غياب مفاتيح Pusher (بيئة تطوير/إنتاج بلا إعدادات) → كان المتصفح يواجه سلسلة `403` في وحدة التحكم.
- الآن يعيد `null` وتتعامل الدوال المنبثقة (`pushUserNotification`، `broadcastAssessmentUpdate`) مع الحالة بهدوء (لا بث). `authenticateChannel` يتحقق من الجاهزية ويعيد رفضاً نظيفاً عند الطلب الفعلي.
- **الأثر:** لا ضجيج خطأ في وحدة التحكم، وتعمل الإشعارات اللحظية عندما تكون الإعدادات مكتملة فعلاً.

## 4) كاش المقيّمين والنماذج الموجودة مسبقاً

- `lib/cache.ts` يستخدم `React.cache` أيضاً لـ `getCachedExaminers` و `getCachedExamModels` و `getCachedActiveSeason` — استخدام واحد لكل طلب.

## 5) تنظيف المستخدمين وتوحيد الحسابات (الأدوار الستة فقط)

- **الملف:** `scripts/apply-user-fixes.ts`
- حُذف جميع المستخدمين الزائدين (87 جهة + 8 معلمين + 3 إداريين) تاركاً **6 حسابات فقط**:
  - `admin@example.com` — دور ADMIN — كلمة المرور: `QuranAdmin2026!Strong`
  - `specialist@example.com` — دور TEST_SPECIALIST — كلمة المرور: `QuranTest2026!Strong`
  - `head.affairs@example.com` — دور HEAD_OF_AFFAIRS — كلمة المرور: `QuranTest2026!Strong`
  - `certificate.source@example.com` — دور CERTIFICATE_SOURCE — كلمة المرور: `QuranTest2026!Strong`
  - `ahmed.mohammad@example.com` — دور EXAMINER — كلمة المرور: `QuranTest2026!Strong`
  - `inst.cmtubnfm@example.com` — دور INSTITUTION — كلمة المرور: `oossaammaammrr2011@`
- جميع كلمات المرور مشفرة بـ bcrypt (cost factor 12).
- يمكن إعادة التنفيذ بأمان عبر: `pnpm fix:users`.

## 6) التحقق النهائي

- `pnpm fix:users` ✅ — 6 مستخدمين فقط، لا حذف إضافي مطلوب.
- `pnpm typecheck` ✅ بدون أخطاء.
- `pnpm build` ✅ بدون أخطاء (37 صفحة، 87.3kB أول حمولة مشتركة).

---

## 7) التصحيحات النهائية (o.txt)

### المهمة 1: Migration redesign_committees
- تم تطبيق migration `redesign_committees` بنجاح على Neon.
- الجداول الجديدة: `committees`، `committee_model_allocations` (معدّلة)، `assessment_settings`.
- الحقول الجديدة في `students`: `nationality`، `committeeId`.

### المهمة 2: التحقق من تكرار password
- تحققنا من `lib/validations/user.ts` و `auth.ts` — لا يوجد تكرار، كلاهما يحتوي تعريفاً واحداً فقط.

### المهمة 3: Modal "ابدأ الاختبار" يطلب رقم النموذج
- **الملف:** `components/examiner/examiner-dashboard-client.tsx`
- أُضيف `Input` لرقم النموذج مع تحقق من النطاق (`startModelNumber` → `endModelNumber`).
- زر "تأكيد" معطّل حتى يُدخل رقم صحيح.
- عند التأكيد ينتقل إلى `/examiner/assess/${id}?model=${number}`.

### المهمة 4: صفحة التقييم تقرأ searchParams.model
- **الملف:** `app/(dashboard)/examiner/assess/[studentId]/page.tsx`
- الصفحة الآن تقرأ `searchParams.model` من URL.
- إذا الرقم خارج نطاق اللجنة → رسالة خطأ واضحة.
- إذا لم يوجد النموذج → رسالة خطأ واضحة.
- لا يُحمَّل النموذج الأول تلقائياً بعد الآن.

### المهمة 5: AssessmentBoard يستخدم AssessmentSettings من DB
- **الملف:** `components/examiner/assessment-board.tsx`
- يقبل `prop: settings` من `AssessmentSettings`.
- صفحة التقييم تستدعي `getAssessmentSettings()` وتمررها كـ prop.
- جميع الخصومات теперь ديناميكية من قاعدة البيانات.

### المهمة 6: تبسيط واجهة التقييم إلى 3 أزرار
- **الملف:** `components/examiner/assessment-board.tsx`
- بدلاً من 7 أعمدة → 3 أعمدة فقط: **خطأ**، **شك**، **تجويد**.
- حقل جديد `tajweedErrors` في `Assessment` schema + migration.
- خصومات ديناميكية: `errorDeduction` × errorCount، `doubtDeduction` × doubtCount، `tajweedDeduction` × tajweedErrors.
- الدرجة النهائية تُحدَّث فورياً عند كل ضغطة.
- الحقول القديمة (wordErrors, letterErrors, إلخ) محفوظة في DB للتوافق.

### المهمة 7: عرض الجنسية في صفحة الأخصائي
- **الملف:** `components/specialist/requests-table.tsx`
- أُضيف عمود "الجنسية" في جدول طلبات الترشيح.

### إصلاحات إضافية:
- `assertExaminerInSession` في `lib/security.ts` الآن يدعم اللجنة الجديدة (Committee) بالإضافة إلى الجلسات القديمة.
- `resolveModelId` في `assessment-actions.ts` بُسّط ليعمل مع أي تدفق (قديم/جديد).
- `AssessmentUpdatePayload` في `realtime-client.ts` محدّث ليتوافق مع التنسيق الجديد (3 أعمدة).