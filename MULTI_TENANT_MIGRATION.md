# Multi-Tenant Migration — Session 1/4 (Session 2 مكتملة)

## تاريخ التنفيذ
2026-09-12

## الحالة
✅ **مكتمل** — لم تُمسّ أي بيانات.

## المنجز

### Schema Changes
- ✅ إضافة `Role.SUPER_ADMIN`
- ✅ إنشاء نموذج `Tenant` (بدون TenantBranding)
- ✅ إضافة `tenantId String?` إلى 12 جدول:
  User, Institution, Student, ExamSeason, ExamModel,
  Committee, ExamSession, Assessment, Certificate,
  Notification, AuditLog, AssessmentSettings

### Migration
- ✅ `add_tenant_support_phase1` مطبّقة على Neon

### Verification
- ✅ `pnpm prisma validate` — OK
- ✅ `pnpm prisma migrate status` — up to date
- ✅ `pnpm typecheck` — 0 errors
- ✅ `pnpm build` — success
- ✅ Snapshot محلي: `snapshots/schema_before_multi_tenant.prisma`

## 🚨 تأكيدات مهمة

1. **لم يُحذف أي مستخدم** — جميع المستخدمين الحاليين في أماكنهم.
2. **لم تُحذف أي بيانات** — كل الجداول كما هي.
3. **المنصة قابلة للاستخدام الآن** — لم تتأثر بأي شيء.
4. `tenantId` بقيمة `null` حالياً في كل السجلات — سيُملأ في الجلسة 2.

## القرارات المعمارية

- `AppSettings` — **global** (اسم المنصة + الشعار موحّدان).
- `RateLimit` — **global**.
- `CommitteeModelAllocation` — **لم يُعدَّل بعد**.
- `Tenant` يحوي الألوان مباشرة (بدون نموذج منفصل).

## ملاحظات فنية (Session 1)

- علاقة `Tenant → AssessmentSettings` نُفّذت كعلاقة **one-to-many** (`AssessmentSettings[]`)
  بدلاً من one-to-one الواردة في خطة o.txt، لأن `tenantId` في `AssessmentSettings`
  ليس له `@unique` — وبهذا يلتزم النمط الموحّد للجداول الـ 12 جميعاً. (متوقع من o.txt:
  "عادةً سيكون بسبب علاقات ناقصة في Tenant — صحّحها ثم أعد البناء".)
- أُضيف `SUPER_ADMIN` إلى `Record<Role, string>` في `lib/roles.ts`
  (`ROLE_LABELS` + `ROLE_DASHBOARD_PATHS` → `/admin`) وإلى خريطة الأدوار في
  `tests/e2e/core-workflows.spec.ts` لاستيفاء النوع الشامل `Record<Role, ...>`
  بعد إضافة العضو الجديد للـ Enum (بدون أي تعديل على Server Actions).
- نقطة رجوع Git: `checkpoint: before multi-tenant schema migration`.

## المهام التالية (الجلسة 2)

1. إنشاء Tenant افتراضي "جمعية تعليم القرآن وعلومه - فرع المدينة المنورة"
2. ربط جميع البيانات الموجودة به
3. جعل `tenantId` NOT NULL
4. **حذف جميع المستخدمين إلا `ossamaamr50436@gmail.com`** (الخطوة الأخيرة)
5. تحديث `@@unique` ليشمل `tenantId`

## ملاحظات

- السكربتات المؤقتة (إن وُجدت) — احذفها بعد الانتهاء.
- لم يُرفع شيء إلى GitHub (commit محلي فقط).

---

# Session 2 — ربط البيانات بالمستأجر الافتراضي

## الحالة
✅ **مكتمل** — `tenantId` الآن NOT NULL في كل الجداول التابعة للمستأجر، والمنصة تبني بنجاح.

## المنجز

### 1) المستأجر الافتراضي
- ✅ حُذفت بيانات التمرين/السكربتات (Session 1 transformer) — اكتُشفت أشخاص بـ 1@3.sa,
  1@1.sa (olehta5@gmail.com) قبل التأكيد التنفيذي (لم تُستخدم).
- ✅ أُنشئ `Tenant`: slug `madina-quran`، الاسم "جمعية تعليم القرآن وعلومه - فرع المدينة المنورة"
  (المعرّف: `cmtyqsflq0000bught6ds9gqv`).

### 2) بيانات مرتبطة بالمستأجر (قبل حذف المستخدمين)
- ✅ 5 مستخدمين، موسمان، 100 نموذج امتحان، 50 سجل Audit → رُبطت.
- ✅ تحقق انتهائي: `null-check = 0` في كل الجداول المرتبطة.

### 3) حذف المستخدمين غير المطلوبين
- ✅ حُذف: 1@3.sa (HEAD_OF_AFFAIRS)، 1@4.sa (CERTIFICATE_SOURCE)،
  1@2.sa (TEST_SPECIALIST)، mr.hema95373@gmail.com (ADMIN).
- ✅ 15 سجل Audit أصبحت `userId = null` (عمداً — لا يوجد مستخدم مرتبط).
- ✅ الباقي: `ossamaamr50436@gmail.com` (ADMIN، `tenantId` = المستأجر الافتراضي).

### 4) تعديلات المخطط (NOT NULL + @unique)
- ✅ `tenantId String` NOT NULL على 11 جدول (الكل ما عدا `User` يبقى اختيارياً).
- ✅ `Committee` → `@@unique([tenantId, name, seasonId])`.
- ✅ `ExamModel` → `@@unique([tenantId, modelNumber, seasonId, branch])`.
- ✅ `AssessmentSettings` → `tenantId String @unique` (تحويل العلاقة إلى one-to-one فعلية).
- ✅ `prisma format` + `prisma validate` — OK.

### 5) الهجرة
- ⚠️ `migrate dev` غير قابل للاستخدام في هذه البيئة (تشغيل غير تفاعلي + تحذيرات فكّ فحص).
- ✅ بديل: `prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script`
  → صيغ SQL ثم `prisma migrate deploy` (مطبّقة بنجاح، 12 هجرة).
- ⚠️ تحذيرات فكّ الفحص (آمنة — لا تكرار في البيانات):
  `assessment_settings_tenantId_key`، `committees_tenantId_name_seasonId_key`،
  `exam_models_tenantId_modelNumber_seasonId_branch_key`.

### 6) الإبقاء على الترجمة بعد جعل `tenantId` إلزامياً
- ✅ أُضيفت `tenantId` في مسار TSC للـ create/upsert في كافة Server Actions، `auth.ts`
  (سجلات Audit نجاح/فشل تسجيل الدخول)، `lib/notifications.ts`، `/api/import/models`،
  `prisma/seed.ts`، وسكربتي `apply-user-fixes` و `import-quran-models`.
- ✅ مُساعدان جديدان في `lib/security.ts`:
  - `requireTenantId(user)` — يرمي خطأً إن كان `user.tenantId` فارغاً.
  - `getActorTenantId(userId)` — يحلّ Tenant الـ Actor من قاعدة البيانات (لـ Audit).
- ✅ حُذفت السكربتات المؤقتة: `export-current-data.ts`, `create-default-tenant.ts`,
  `link-data-to-tenant.ts`, `delete-non-super-admin-users.ts`.
- ✅ `npx tsc --noEmit` — **0 أخطاء**، و `npm run build` — **نجاح**.

## نقاط رجوع Git
- قبل الربط: `c9860e6 checkpoint: before multi-tenant data linking`.
- Snapshot: `snapshots/schema_before_data_linking.prisma` + `snapshots/data_export/pre_migration.json`.

## ملاحظات (Session 2)
- `User.tenantId` يبقى اختيارياً (مستخدم واحد متبقٍ مربوط بالمستأجر).
- التعديلات على Server Actions كانت الحد الأدنى المطلوب للترجمة فقط (لا تغيير في المنطق).
- التعديل القادم في الجلسة 3 (حسب o.txt): حقول العرض العامة السمعية/البصرية في UI مع
  `UseTenant` واستعلامات `tenantId` في Server Actions.

## ملاحظات
- لم يُرفع شيء إلى GitHub بعد (commits محلية فقط).

---

# Session 3 — طبقة عزل المستأجرين (Tenancy Isolation Layer)

## الحالة
✅ **مكتمل** — تمت ترقية المالك إلى SUPER_ADMIN، أُنشئت أدوات العزل المنطقية،
وأضيفت فلاتر `tenantId` على قراءات وكتابات جميع Server Actions الخاصة ببيانات المستأجر.
`npx tsc --noEmit` = 0 أخطاء، و `npm run build` = نجاح.

## المنجز

### 1) ترقية المالك إلى SUPER_ADMIN
- ✅ `ossamaamr50436@gmail.com` → `Role.SUPER_ADMIN` و `tenantId = null`
  (المعرّف: `cmtvkn4oz00009ydxsukscep9`).
- ✅ نُفّذت عبر سكربت مؤقت `scripts/promote-owner-to-super-admin.ts` (npx tsx)
  **بدلاً من** هجرة Prisma مسمّاة `promote_owner_to_super_admin` — لم يطرأ أي تغيير على
  المخطط (Schema)، التغيير بيانات فقط، فلا حاجة لهجرة. (انحراف موثّق عن o.txt القسم 7)

### 2) `lib/tenancy.ts` — أدوات العزل (Server-only)
- `getTenantFilter(user)` → `{}` لـ SUPER_ADMIN، والا `{ tenantId }` (يرمي إن لم يكن مربوطاً).
- `requireTenant(user)` → يعيد `tenantId` أو يرمي (ممنوع على SUPER_ADMIN).
- `requireSuperAdmin(user)` → يمنع غير المالك.
- `assertSameTenant(user, resource)` → يتحقق أن السجل في tenant المستخدم (SUPER_ADMIN يمر دائماً).
- `assertHasRole(user, allowed)`.

### 3) التوجيه حسب الدور (Routing)
- ✅ `auth.config.ts`: `SUPER_ADMIN → "/super-admin"` في `ROLE_DASHBOARD_PATHS`
  + كتلة إعادة توجيه إجبارية (بعد فحص `mustChangePassword`).
- ✅ `lib/roles.ts`: `SUPER_ADMIN: "/super-admin"`.
- ✅ صفحة جديدة `app/(dashboard)/super-admin/page.tsx` (لوحة مالك المنصة، `requireSuperAdmin`).
- ⚠️ **قرار**: لم تُضَف إعادة توجيه إجبارية صريحة لـ ADMIN (المنطق الحالي يوجّهه إلى
  `/admin` ويحافظ على وصوله إلى `/audit-log` و `/admin/reports`) — تجنّباً لكسر تلك المسارات.

### 4) فلاتر `tenantId` على Server Actions (ملف بعد ملف)
- ✅ `assessment-settings-actions` | `audit-actions` | `season-actions`
- ✅ `head-actions` | `examiner-actions` | `entity-actions` | `committee-actions`
- ✅ `model-actions` | `certificate-actions` | `student-actions` | `assessment-actions`
- ✅ `admin-actions` | `admin-panel-actions` | `auth-actions` (`getStudentsForCurrentUser` بكل فروعه)
- النمط الموحّد: `getTenantFilter(user)` في `where` القراءات و `findFirst`/`findMany`
  والتهم؛ `assertSameTenant` بعد `findUnique` لكل UPDATE/DELETE على سجل.
- كُتبات الإنشاء: `tenantId: requireTenantId(user)` على `user.create` / `institution.create`
  (examiner-actions، entity-actions، admin-panel-actions).
- تحقق فقط (لا تعديل): `notification-actions` (نطاقها `userId` الخاص)،
  `change-password-actions` (مستخدمه)، `settings-actions` (AppSettings **global** — متعمّد)،
  `unique-guard.ts` (لا استعلامات).

## Keep `User.tenantId` اختيارياً
- ✅ يظل `User.tenantId String?` — SUPER_ADMIN بلا tenant.
- ✅ الدخول يعمل بكلمة المرور الحالية (لم تُمسّ).

## فرسان من Session 2 (تم التأكيد)
- ✅ `getCurrentUser` يختار `tenantId` فعلاً (و `SessionUser` في `lib/security.ts` مشتق منه).

## التحقّق
- ✅ `npx prisma format` + `prisma validate` + `prisma generate` — OK
- ✅ `npx tsc --noEmit` — **0 أخطاء**
- ✅ `npm run build` — **نجاح** (الطريق `/super-admin` مُسجَّل)

## نقاط رجوع / Snapshots
- Checkpoint قبل الجلسة: `f8bb0ad checkpoint: before tenancy isolation layer`.
- Snapshots: `snapshots/schema_before_tenancy.prisma` + `snapshots/data_export/post_session2.json`.

## ملاحظات (Session 3)
- قاعدة البيانات حالياً تحتوي مستخدماً واحداً (SUPER_ADMIN) — عمليات الأدوار المتعددة
  غير قابلة للوصول عملياً حتى إنشاء مستخدمين جدد، والفلاتر جاهزة للمستقبل.
- `getTenantFilter` صُمم ليُمرَّر للمستخدم القادم من `getCurrentUser()` (نفس نوع `SessionUser`).

## المهام التالية (الجلسة 4)
- حقول العرض العامة للمستأجر (Branding) في الواجهة مع `UseTenant`.
- وثائق واستكمال أي تسريبات متبقية (إن وُجدت).

## ملاحظات
- لم يُرفع شيء إلى GitHub (commits محلية فقط).

---

# Session 4/4 — الأمان الثلاثي (Phase C) + التوثيق (Phase D)

## الحالة
✅ **مكتمل** — طبقات الأمان الثلاث تنفيذاً، migration الـ RLS محضَّر (ملف فقط، **غير مطبّق**)،
وأُنجزت وثائق Phase D. `pnpm typecheck` = 0 أخطاء، `pnpm lint` نظيف، `pnpm build` نجاح.

## المنجز

### Layer 1 — Authentication Hardening
- ✅ `auth.config.ts`: تحقّق — الإعدادات موجودة أصلاً ومطابقة للمطلوب
  (session `maxAge: 8h`, `updateAge: 1h`؛ Cookies `__Secure-next-auth.session-token` +
  `httpOnly` + `sameSite: "lax"` + `secure` في الإنتاج).
- ✅ `auth.ts`: Account Lockout — 5 محاولات فاشلة خلال 15 دقيقة → قفل مؤقت 15 دقيقة،
  الفحص **قبل** مقارنة كلمة المرور، والتسجيل كـ `AuditAction.FAILED_LOGIN`.
- ✅ `lib/rate-limit.ts`: `checkMultiLevelRateLimit(user, ip, action)` —
  IP: 100/نافذة، User: 50/نافذة، Tenant: 500/نافذة، مع تنبيه `RATE_LIMIT_HIT` مكرَّر مرة واحدة.

### Layer 2 — RLS (بدون تطبيق)
- ✅ إضافة قيم `AuditAction` الجديدة: `SUSPICIOUS_ACCESS`, `RATE_LIMIT_HIT`,
  `CROSS_TENANT_ATTEMPT`, `FAILED_LOGIN`.
- ✅ Migration `add_security_audit_actions` (enum فقط) — **طُبِّق فعلياً**.
- ✅ Migration `enable_row_level_security` بصيغة `--create-only` (ملف فقط):
  `ENABLE` + `FORCE ROW LEVEL SECURITY` على 11 جدولاً + `CREATE POLICY
  tenant_isolation_<table>` لكل جدول بدالة `_rls_tenant_context()`.
  ⚠️ **لم يُطبَّق** بـ`migrate deploy` — جاهز للتطبيق لاحقاً.
- ✅ `lib/tenancy-db.ts`: `withTenantContext(user, fn)` — utility جاهز غير مستخدم بعد.
- 🧾 السبب (قرار معماري إلزامي): RLS مع Neon Pooler يتطلب `withTenantContext` في كل
  Server Action — عمل ضخم مؤجَّل للإصدار التالي.

### Layer 3 — Intrusion Detection + Alerting
- ✅ `lib/security-alerts.ts`: `raiseSecurityAlert(payload)` —
  AuditLog (`tenantId: null`) + Pusher `private-super-admin-alerts` + Notifications
  لكل `SUPER_ADMIN`؛ فشل التنبيه لا يُفشل الطلب (عزل بـ try/catch لكل قناة).
- ✅ حقن التنبيهات: `lib/tenancy.ts → assertSameTenant → CROSS_TENANT_ATTEMPT`،
  `lib/rate-limit.ts → RATE_LIMIT_HIT`، `auth.ts → FAILED_LOGIN`.
- ✅ `app/api/pusher/auth/route.ts`: قناة `private-super-admin-alerts` حصرية لـ `SUPER_ADMIN`
  (دور المستخدم يُمرَّر إلى `authenticateChannel`).
- ✅ صفحة `/super-admin/alerts` تعمل (تسميات الفعالية الجديدة + الاشتراك اللحظي).

### Hardening إضافي
- ✅ `next.config.mjs`: 10 ترويسات أمان (أُضيف X-DNS-Prefetch-Control، X-Download-Options،
  X-Permitted-Cross-Domain-Policies فوق الـ 7 الموجودة سابقاً).
- ✅ `pnpm audit --audit-level=moderate`:
  - ترقية `next` 14.2.35 → **15.5.25** (إصلاح 2 ثغرات **critical** RCE مباشرة) +
    تكييف async APIs (`headers()`/`params`/`searchParams`).
  - ترقية `eslint-config-next` → 15.5.25، و`vitest` → 3.2.7 (إصلاح critical dev).
  - بقية الثغرات: transitive/moderate — **موثّقة** في `SECURITY_ARCHITECTURE.md`
    (منها `xlsx` مباشر بلا إصلاح على npm — مستخدم في السكريبتات فقط).

### Phase D — التوثيق (4 ملفات)
- ✅ `MULTI_TENANT_MIGRATION.md` (هذه — Session 4/4).
- ✅ `SECURITY_ARCHITECTURE.md` (جديد).
- ✅ `PERFORMANCE_BENCHMARKS.md` (محدَّث).
- ✅ `PENETRATION_TEST_CHECKLIST.md` (جديد، 8 أقسام).

## التحقّق
- ✅ `pnpm typecheck` — **0 أخطاء**
- ✅ `pnpm lint` — **نظيف** (`next lint` أُشير إلى انتهاء صلاحيته في Next 15 — غير مانع)
- ✅ `pnpm build` — **نجاح** (49 مساراً)
- ✅ `pnpm prisma validate` + `prisma generate` (بعد إضافة قيم الـ enum) — OK

## ملاحظات (Session 4)
- ⚠️ **لم يُنفَّذ** `prisma migrate deploy` بعد إنشاء مجلد
  `20260913110000_enable_row_level_security` — أي deploy لاحق سيطبّق الـ RLS.
- عرض Branding العام في الواجهة (المذكور بجلسة 3 كأولوية الجلسة 4) **خارج** نطاق
  Phase C/D حسب o.txt — لم يُنفَّذ بعد.
- لم يُرفع شيء إلى GitHub (commits محلية فقط).