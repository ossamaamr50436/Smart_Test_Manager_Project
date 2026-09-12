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