# Multi-Tenant Migration — Session 1/4

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