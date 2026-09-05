# دليل المطور

## نظرة عامة على البنية

```
app/
  (dashboard)/            الصفحات الرئيسية لكل دور
  (auth)/                 صفحة الدخول والتسجيل
  api/auth/[...nextauth]  نقطة NextAuth
  api/export/             تصدير الجداول (Excel/CSV) للأدوار المصرح بها
  api/import/models/      استيراد النماذج عبر CSV
lib/
  actions/                كل Server Actions (المصدر الوحيد لتغيير البيانات)
    admin-actions.ts      اعتماد الأخصائي + اعتماد رئيس الشؤون
    assessment-actions.ts التقييم الحي + الاعتماد حسب العمر
    auth-actions.ts       الدخول/الخروج والجلسة
    certificate-actions.ts توليد الشهادات + التوقيع + الرفع على Drive
    head-actions.ts       مراجعة رئيس الشؤون + الرفض
    institution-actions.ts ترشيح الجهة لطلابها
    notification-actions.ts الإشعارات
    season-actions.ts     إدارة المواسم
    student-actions.ts    إدارة الطلاب
    user-actions.ts       إدارة المستخدمين والأدوار
  security.ts            أدوات عزل الصلاحيات (requireUser/requireRole/assert*)
  prisma.ts              عميل Prisma الموحّد
  google-drive.ts        تكامل Drive (رفع/تنزيل) عبر Service Account
  socket.ts              عميل Socket.IO للتزامن اللحظي
  certificate-pdf.tsx    مولد PDF العربي للشهادة
auth.ts / auth.config.ts / middleware.ts   إعداد NextAuth ودروع المسارات
prisma/schema.prisma     مخطط قاعدة البيانات (Neon PostgreSQL)
```

## المتطلبات (المادة 4)

- **قاعدة بيانات سحابية فقط (Neon PostgreSQL)** — ممنوع SQLite أو أي قاعدة محلية.
- **الملفات على Google Drive فقط** (خدمة `googleapis`) — الملفات تُرفع وتُقرأ من Drive ولا تُخزّن محلياً.
- **عزل الصلاحيات**: كل Server Action يبدأ بفحص الدور عبر `requireRole`؛ لا تعتمد على إخفاء الواجهة فقط.

## أوامر شائعة

```bash
pnpm dev         # تطوير (http://localhost:3000)
pnpm build       # بناء الإنتاج
pnpm start       # تشغيل البناء محلياً
pnpm lint        # فحص ESLint
pnpm tsc         # فحص الأنواع (TypeScript Strict)
pnpm prisma:generate # توليد عميل Prisma
pnpm prisma:push # مزامنة المخطط مع قاعدة البيانات
npx tsx prisma/seed.ts  # تهيئة حساب المسؤول العام وحذف الحسابات التجريبية
```

> المتغيرات: استخدم `.env.example` كقالب ثم أنشئ `.env` (لا يُرفع إلى Git).

## حالات الطالب (StudentStatus)

| الحالة | المعنى |
|---|---|
| `PENDING` | مرشح من جهة، بانتظار مراجعة الأخصائي |
| `APPROVED` | معتمد إدارياً — قابل للتوزيع على لجنة |
| `ASSIGNED` | موزع على لجنة (معلمان) |
| `NOTIFIED` | اكتمل اعتماد اللجنة والأخصائي — بانتظار رئيس الشؤون |
| `COMPLETED` | اعتماد رئيس الشؤون أكمل — جاهز للشهادة |
| `REJECTED` | رفض في مرحلة ما — يعود لسير العمل |

## حالات التقييم (AssessmentStatus)

| الحالة | المعنى |
|---|---|
| `DRAFT` | حفظ أولي من أحد المعلمين |
| `SAVED` | التقييم محفوظ من أحد المقيّمين |
| `FINALIZED` | التقييم مكتمل بدرجة نهائية |
| `APPROVED` | اعتماد المعلم الأكبر سناً (المادة 5) |
| `ACCEPTED` | اعتماد الأخصائي إدارياً/نهائياً |

## سير الاعتماد حسب العمر — المنطق في `approveAssessment`

1. `getAssessmentState` يحسب `seniorIsUser` من تاريخَي ميلاد المعلمين في اللجنة (Date <).
2. `approve` (الأكبر): يطابق `APPROVED` على الجلسة، ولا يسمح للأصغر.
3. `finalize` (الأصغر): يتحقق أن **تقييم المعلم الأكبر** أصبح `APPROVED` (وليس تقييم المستخدم نفسه)، ثم يثبت الدرجة النهائية.

> ⚠️ لأي تعديل مستقبلي: لا تُبقِ شرط الترتيب في الواجهة فقط — تحقَّق منه دائماً داخل الدالة (Server Action).

## عزل الصلاحيات — نمط موحّد

```ts
"use server";
import { requireUser, requireRole } from "@/lib/security";

export async function someAction(id: string) {
  const user = await requireUser();            // جلسة صالحة
  requireRole(user, [Role.TEST_SPECIALIST]);   // دور محدد
  // ... المنطق
}
```

مثالات مهمة:
- `assertInstitutionOwnsStudent` — تمنع الجهة من لمس طلاب جهات أخرى.
- `assertExaminerInSession` — تمنع المعلم من تقييم لجنة ليست له.
- `headOfAffairs` لا يدخل واجهة التقييم الحي (المادة 8/4) — يُحذف الدور من قوائم الوصول داخل `assessment-actions`.

## نماذج الاختبار ومنع التكرار (المادة 6)

`resolveModelId(sessionId)` يختار نموذجاً من جهة الطالب في الموسم الحالي **لم يُستخدم بعد** مع طالب آخر (لا يعتمد على "أول نموذج" دائماً). عند التوزيع يمنع التكرار أيضاً: يجري تحقق إضافي في `assignAssessorsCommand` من عدم وجود تقييم سابق يستخدم نفس النموذج في نفس الجلسة.

## ملفات Google Drive (`lib/google-drive.ts`)

- `uploadFileToDrive(buf, name, mime)` — يرفع إلى `GOOGLE_DRIVE_FOLDER_ID` ويُرجع `{ id, webViewLink }`.
- `getExamModelsFromDrive()` — يسرد مجلد النماذج (`GOOGLE_DRIVE_MODELS_FOLDER_ID` اختياري، وإلا المجلد الرئيسي).
- مسارات الشهادات تُرفع في `signCertificate` وتُعرض روابطها في واجهات العرض.

## ملاحظات الأداء والأمان

- كل الاستعلامات المفصلة تُقيّد بـ `select` لتقليل الحمولة.
- الأخطاء الداخلية لا تُكشف في استجابات API (رسائل عامة).
- `middleware.ts` يحمي `/api` و `/dashboard` ويرصد دورات الجلسة.
- `next.config.mjs` يضيف رؤوس أمان (CSP و headers) لجميع المسارات.

## التزامن اللحظي (Socket.IO)

- `lib/socket.ts` يفتح اتصالاً من المتصفح إلى نفس الأصل، ويُستخدم داخل صفحات التقييم لعرض التعديلات اللحظية.
- للاستخدام الموسّع في الإنتاج: شغّل خادم Socket.IO مستقلاً (Serverless لا يدعم اتصالات طويلة) ووجّهه بنفس بيانات الجلسة.

## إضافة سمة جديدة (Prisma)

1. عدّل `prisma/schema.prisma` (انتبه: مزود PostgreSQL فقط).
2. `pnpm prisma:push` لمزامنة المخطط.
3. أدرج الأنواع الجديدة في عمليات الاستعلام، وحدّث الأدوار إذا لزم التمييز.

## فحص سلامة قبل الرفع

قبل كل إصدار: `pnpm lint` ثم `pnpm tsc` ثم `pnpm build` (كلها يجب أن تمر بلا أخطاء).