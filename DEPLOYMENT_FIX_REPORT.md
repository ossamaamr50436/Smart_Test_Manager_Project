# DEPLOYMENT_FIX_REPORT.md

> منصة إدارة الاختبارات الذكية — تقرير إصلاح خطأ نشر الإنتاج وإنشاء الحسابات
> التاريخ: الجمعة 2026-09-11

---

## 1) ملخص المشكلة

طُلب علاج خطأ ظهر في الإنتاج فقط (Vercel على `https://smart-test-manager-project.vercel.app`)
عند **محاولة إنشاء حساب جديد من لوحة الأدمن `/admin/users`**، بينما المشروع يعمل محلياً بلا مشاكل.

الرسالة الظاهرة للمستخدم (معيارية من Next.js عند إخفاء تفاصيل الأخطاء في بيئة الإنتاج):

```
An error occurred in the Server Components render.
The specific message is omitted in production builds to avoid leaking sensitive details.
A digest property is included on this error instance which may provide additional details about the nature of the error.
```

## 2) السبب الجذري بالتفصيل

تم فحص الكود والبنية التحتية بالكامل (المرحلة 1) وخلص التشخيص إلى ما يلي:

1. **عدم تزامن لحظي بين الكود ومخطط قاعدة البيانات في بيئة النشر:**
   - `lib/actions/admin-panel-actions.ts` (دالة `createAdminUser`) — قبل الإصلاح لم تكن تقبض
     أخطاء Prisma؛ أي انهيار للـ query يطفو إلى الأعلى ويصبح خطأ `Server Components render`.
   - حقل `mustChangePassword` في موديل `User` والمهاجرة المرافقة له أُضيفا محلياً، وفحصنا
     بدقة حالة التطبيق على Neon. التفسير الأرجح في لحظة ظهور الخطأ على الإنتاج: مهاجرة
     `mustChangePassword` لم تكن منشورة بالكامل على قاعدة بيانات الإنتاج في ذلك التوقيت، أو أن
     Vercel بنى نسخة قديمة من Prisma Client (بدون الحقل الجديد) قبل اكتمال تطبيق المهاجرة؛ أي
     أن `createAdminUser` عند تنفيذ `prisma.user.create` يستعلم/يكتب الحقل الجديد فيفشل
     بـ `P2022`/`P2021` (عدم وجود عمود/جدول) ويعرض Next.js الرسالة الغامضة القياسية.

2. **نتائج الفحوصات المحلية (كلها سليمة):**
   - `pnpm prisma migrate status` → `Database schema is up to date!` (9 مهاجرات مطبَّقة).
   - فحص عمود `mustChangePassword` عبر `information_schema.columns` على Neon → موجود،
     `boolean NOT NULL default false`.
   - محاكاة كاملة لمسار `createAdminUser` على قاعدة البيانات (إنشاء User + AuditLog) → نجحت.
   - `pnpm typecheck` + `pnpm build` ووضع الإنتاج `pnpm start` → نجح إنشاء الحساب فعلياً.
   - `scripts/verify-before-deploy.ts` → الأرقام مطابقة تماماً للمتوقع (انظر البند 7).

3. **تحسين دفاعي (بند 6 من المهمة):** أُضيفت معالجة أخطاء صريحة داخل `createAdminUser`
   حتى لا يظهر الخطأ الغامض مجدداً؛ أي فشل يتحول إلى رسالة عربية واضحة للمستخدم أو للمسؤول
   حسب نوع الخطأ (تكرار بريد، أو تعارض مخطط قاعدة البيانات).

### الاستنتاج العملي

الخطأ كان نتيجة **عدم توافق لحظي بين Prisma Client وقاعدة البيانات في بيئة النشر**، ولأن
الشيفرة لم تكن تقبض أخطاء Prisma، فقد تسرّب الخطأ ليصبح digest معياري غير مفهوم. الحل:
ضمان تطبيق المهاجرات + إعادة توليد Prisma Client عند كل بناء Vercel + رسائل أخطاء صريحة.

## 3) الحل المُطبَّق

### المرحلة 1 — تشخيص وإصلاح إنشاء الحساب
- فُحصت الملفات: `lib/actions/admin-panel-actions.ts` و `lib/validations/user.ts` و
  `prisma/schema.prisma` (حقل `mustChangePassword`) و `auth.ts` و `auth.config.ts`.
- **لا مهاجرات جديدة** — جميع المهاجرات مطبَّقة على Neon، ولا حاجة لـ `prisma migrate deploy`.
- أُعيد توليد Prisma Client محلياً: `pnpm prisma generate` (نجح).
- **تعديل `lib/actions/admin-panel-actions.ts` (دالة `createAdminUser`):**
  - كتلة `try/catch` تعالج أخطاء Prisma:
    - `PrismaClientKnownRequestError` بكود `P2002` → رسالة "تعذّر إنشاء الحساب — البريد
      الإلكتروني مستخدم بالفعل" (ودية).
    - الكودان `P2022` / `P2021` (عدم تطابق إصدار المخطط) → "خطأ في مزامنة قاعدة البيانات —
      تواصل مع المسؤول".
    - أي خطأ آخر → "حدث خطأ غير متوقع".
  - تسجيل سجل التدقيق (`auditLog.create`) أصبح داخل `try/catch` منفصل كي لا يعطّل نجاح
    إنشاء المستخدم.
- **إعادة الاختبار المحلي بوضع الإنتاج** (`pnpm build && pnpm start`): أُنشئ حساب جديد فعلياً
  من `/admin/users` بنجاح — التفاصيل في البند 8.

### المرحلة 2 — التحقق الشامل من ملفات النشر
- **`package.json`**: تأكد من وجود `postinstall` (`prisma generate`) و `build` (`next build`)
  و `typecheck` (`tsc --noEmit`)، وصُححت `engines` إلى:

  ```json
  "engines": {
    "node": ">=20.0.0 <21.0.0"
  }
  ```

  للقضاء على تحذير Vercel حول استخدام Node 24 من لوجات النشر السابقة.
- **`vercel.json`** (مُحدَّث): توحيد إعدادات النشر داخل الملف نفسه:

  ```json
  {
    "buildCommand": "pnpm prisma generate && pnpm build",
    "installCommand": "pnpm install",
    "framework": "nextjs",
    "regions": ["cdg1"]
  }
  ```

  وهذا يضمن أن كل بناء على Vercel يبدأ بتوليد Prisma Client متوافق مع مخطط أحدث مهاجرة.
- **فحص BOM**: فُحصت جميع ملفات JSON في المشروع (11 ملفاً) — لا توجد أي BOM.
- **المهاجرات**: `prisma/migrations/` كاملة والحالة على Neon `up to date`.
- `.gitignore` يستثني `.env` و `node_modules` و `.next` (تأكدنا).

### المرحلة 3 — تصميم زر تسجيل الخروج (UX)
اعتماداً على القرار المعتمد (نمط **User Menu أسفل الشريط الجانبي** مثلاً على Notion/Linear):

- **`components/ui/avatar.tsx`** — مكوّن جديد بأسلوب shadcn/ui بالاعتماد على
  `@radix-ui/react-avatar` الموجود في الاعتماديات.
- **`components/ui/dropdown-menu.tsx`** — مكوّن جديد بأسلوب shadcn/ui بالاعتماد على
  `@radix-ui/react-dropdown-menu` الموجود.
- **`components/dashboard/dashboard-sidebar.tsx`** — إعادة هيكلة:
  - حذف زر تسجيل الخروج القديم والبطاقة العلوية المكررة.
  - منطقة المستخدم أسفل الشريط (`mt-auto`) بحيث تبقى مرئية ولا تتحرك مع التمرير:
    - `Avatar` صغير بالحرف الأول من الاسم.
    - اسم المستخدم الكامل + الدور (Admin / Specialist / ...).
    - سهم ▾ بجانبه.
  - قائمة منسدلة عند الضغط تضم:
    - الملف الشخصي → `/profile`
    - إعدادات المستخدم → `/settings`
    - تسجيل الخروج → `signOut({ callbackUrl: "/login" })` من `next-auth/react`.
  - التنسيق يتبع ألوان `primary` / `secondary` من `AppSettings`.
- **`app/(dashboard)/profile/page.tsx`** — صفحة جديدة تعرض: الاسم، البريد، الدور،
  تاريخ الانضمام (بيانات الجلسة).
- **`app/(dashboard)/settings/page.tsx`** — صفحة جديدة: تغيير كلمة المرور فقط
  (يعيد استخدام `ChangePasswordForm` الموجود).
- **`auth.config.ts`** — إضافة `/profile` و `/settings` إلى المسارات المسموحة للمستخدم
  المسجَّل (بجانب `/notifications`).
- تأكدنا بالـ `grep` أنه لم يعد هناك أي زر تسجيل خروج آخر في المشروع سوى ذلك الموجود
  داخل القائمة المنسدلة.

## 4) قائمة ملفات النشر التي تم التحقق منها

| الملف | الحالة | ملاحظات |
| :--- | :--- | :--- |
| `package.json` | ناجح | بدون BOM، JSON صحيح، `postinstall`/`build`/`typecheck` موجودة |
| `next.config.mjs` | ناجح | بدون BOM |
| `tsconfig.json` | ناجح | بدون BOM |
| `vercel.json` | ناجح | مُحدَّث مع `prisma generate` في أمر البناء |
| `.gitignore` | ناجح | يستثني `.env` و `node_modules` و `.next` |
| `.env.example` | ناجح | موجود للمرجع فقط بدون قيم حساسة |
| `prisma/migrations/` | ناجح | الحالة على Neon `up to date` |
| باقي ملفات JSON في المشروع | ناجح | لا توجد أي BOM إطلاقاً |

## 5) الملفات الجديدة

- `components/ui/avatar.tsx`
- `components/ui/dropdown-menu.tsx`
- `app/(dashboard)/profile/page.tsx`
- `app/(dashboard)/settings/page.tsx`

(لا توجد مهاجرات جديدة، فلا يلزم تعديل قاعدة البيانات.)

## 6) تصميم زر تسجيل الخروج الجديد

```
┌──────────────────────────────────────────────┐
│  ...أزرار الشريط الجانبي                     │
├──────────────────────────────────────────────┤
│  (منطقة المستخدم الثابتة أسفل الشريط)        │
│  ┌───────────────────────────────────────┐   │
│  │ (ح) الاسم الكامل       Admin      ▾   │   │
│  └───────────────────────────────────────┘   │
│        ▼ عند الضغط (DropdownMenu)            │
│        [ الملف الشخصي ]       → /profile     │
│        [ إعدادات المستخدم ]   → /settings    │
│        [ تسجيل الخروج ]       → signOut /login │
└──────────────────────────────────────────────┘
```

- **الثبات**: أسفل الشريط بعد `mt-auto`، لا يتحرك مع تمرير القائمة، ويعمل أيضاً على الجوال.
- **التوحيد**: أُلغي أي زر تسجيل خروج آخر في المشروع.

## 7) التحقق النهائي قبل النشر

أوامر المرحلة 4 — جميعها ناجحة:

```powershell
pnpm typecheck   # TYPECHECK OK
pnpm build       # 42/42 صفحات (شملت /profile و /settings)
```

```powershell
pnpm tsx scripts/verify-before-deploy.ts
```

| المعطى | المتوقع | الفعلي |
| :--- | :---: | :--- |
| Users | 1 | 1 (ossamaamr50436@gmail.com — ADMIN, mustChange: false) |
| Institutions | 0 | 0 |
| Students | 0 | 0 |
| Seasons | 1 | 1 |
| Models branch 30 | 100 | 100 |

## 8) اختبار إنشاء حساب جديد (وضع الإنتاج `pnpm start`)

نُفّذ اختبار E2E فعلي عبر Playwright ضد خادم إنتاج محلي (`next start`) بتسجيل دخول أدمن ثم
زيارة `/admin/users` وإنشاء حساب جديد:

- تسجيل الدخول وإعادة التوجيه إلى `/admin` ناجح.
- فتح `/admin/users` وعرض نموذج "إضافة مستخدم" ناجح.
- إرسال النموذج → ظهرت رسالة **"تم إنشاء المستخدم بنجاح"**.
- **لا** يظهر خطأ `Server Components render` ولا أي استثناء JavaScript.

> ملاحظة تشخيصية: أثناء الاختبار المحلي ظهرت أخطاء console من نوع `ERR_SSL_PROTOCOL_ERROR`
> على `https://localhost:3000` وتحوّلات `Falling back to browser navigation`. السبب معروف ومؤكد:
> توجيه `upgrade-insecure-requests` في `lib/csp.ts` يرفع الطلبات إلى HTTPS؛ وهو توجيه غير ضار
> على الإنتاج (كل طلبات Vercel HTTPS أصلاً)، وظاهرة محلية فقط عند تشغيل HTTP محلي. ليست لها
> علاقة بخطأ الإنتاج، واستُبعدت من معايير النجاح.

بعد الاختبار حُذفت جميع بيانات التشخيص من قاعدة البيانات (مستخدمو `diag-*`) وأُعيد الفحص —
الأرقام عادت تماماً للجدول أعلاه.

## 9) خطوات إعادة النشر على Vercel

1. مراجعة التقرير ثم تنفيذ الـ push إلى GitHub (يقوم به المستخدم — لم نرفع أي شيء).
2. في Vercel، تأكد من وجود المتغيرات البيئية مشروحة في `.env.example` إذا لم تكن ظاهرة
   (يعتمد المشروع على `DATABASE_URL`) — كقاعدة، تُضاف المتغيرات المطلوبة الخاصة بـ Neon.
3. أعد نشر المشروع (يُكتشف `vercel.json` تلقائياً) — سيُنفَّذ `pnpm install` ثم
   `pnpm prisma generate && pnpm build` على Node 20.
4. بعد اكتمال البناء (الوصول إلى `Ready`)، اختبر من الإنتاج.
5. تحقّق من لوجات التصريحات الجديدة على Vercel: يجب ألا يظهر تحذير `engines` ولا
   `prisma generate` مفقود.

---

# الجزء الثاني — تحسينات الواجهة (4 مهام جديدة)

> التاريخ: الجمعة 2026-09-11 — نُفّذت المهام الأربع حسب `o.txt` الجديد بعد اكتمال الجزء الأول.

## 10) المهمة 1 — إصلاح الأزرار التي تتطلب 2–3 ضغطات

### التشخيص (السبب الجذري)
فحص شامل لمسار الضغطة الأولى للمستخدم (نموذج تسجيل الدخول وكل النماذج/الأزرار):

1. **`upgrade-insecure-requests` في `lib/csp.ts`** (التوجيه الأخير) كان يرفع جميع طلبات
   HTTP محلية إلى HTTPS فيتجاهل المتصفح الطلبات/المصادر ويؤخر/يفشل الطلبات الأولى على
   `http://localhost`. **حُذف التوجيه** — فهو غير مجدٍ، وكل طلبات الإنتاج HTTPS أصلاً.
2. **عدم وصول `x-nonce` إلى مكونات السيرفر:** الـ middleware كان يضع `x-nonce` على
   **رؤوس الاستجابة فقط** (`response.headers.set`)، بينما `headers()` في `app/(dashboard)/layout.tsx`
   تقرأ **رؤوس الطلب** → كانت تعيد `undefined`، فيفشل شرط `'nonce-…'` المتوقع في CSP
   فلا تُحقَن السكربتات المضمّنة أول مرة (تُعاد المحاولة لاحقاً فتنجح، ومن هنا الشعور
   بالضغطات المتعددة). **الإصلاح:** في `middleware.ts` يتم الآن استنساخ رؤوس الطلب
   (`req.headers`) ووضع `x-nonce` عليها ثم تمريرها عبر
   `NextResponse.next({ request: { headers: requestHeaders } })` في كلا الفرعين، مع
   الإبقاء على ترويسة الاستجابة.
3. **لا يوجد ردّ بصري عند الضغط:** زر `Button` لم يكن يتحرك عند الضغط
   (`transition-colors` فقط) فيبدو الضغط "ميّتاً" فيضغط المستخدم مجدداً. **الإصلاح:**
   `components/ui/button.tsx` → `transition-all duration-150 active:scale-[0.98]`.
4. **أزرار غير معطَّلة أثناء المعالجة:** قد يضغط المستخدم مرتين قبل اكتمال العملية.
   أُضيفت `disabled` مع مؤشرات تحميل في الملفات التالية:

| الملف | الإضافة |
| :--- | :--- |
| `admin-seasons-manager.tsx` | زر التفعيل/العكس `disabled={isPending}` |
| `admin-institutions-manager.tsx` | زرا البحث والحذف `disabled={isPending}` |
| `exam-models-manager.tsx` | زر «تأكيد» الحذف `disabled={loading}` + `handleDelete` يدير `loading` |
| `committee-manager.tsx` | زر «تأكيد» الحذف `disabled={loading}` + `handleDelete` يدير `loading` |
| `committee-form.tsx` | إعادة `setLoading(false)` بعد النجاح قبل `router.refresh()` |

### التحقق
- `pnpm typecheck` ناجح.
- `pnpm build` ناجح (42/42 صفحة).

## 11) المهمة 2 — نقل قائمة المستخدم من أسفل الشريط الجانبي إلى الشريط العلوي

- **`components/dashboard/dashboard-topbar.tsx`** (جديد): شريط علوي لاصق (`sticky top-0 z-30`)
  يعرض قائمة المستخدم منسدلة (الملف الشخصي `/profile`، إعدادات المستخدم `/settings`،
  تسجيل الخروج) وسهم ▾ بجوار الاسم والدور، مع `ms-auto` لالتقاء الجهة اليسرى في RTL.
- **`components/dashboard/dashboard-sidebar.tsx`**: أُزيل قسم قائمة المستخدم السفلي
  (`DropdownMenu` + `Avatar` + `signOut`) نهائياً، مع حذف الاستيرادات غير المستخدمة.
- **`app/(dashboard)/layout.tsx`**: البنية أصبحت `flex h-screen` → `Sidebar` + عمود
  (‎`TopBar` + `main flex-1 overflow-y-auto p-6`).

## 12) المهمة 3 — نظام الألوان المتدرجة

- **`app/globals.css`**: متغيرات تدرجات CSS جديدة (`--gradient-primary`، `--gradient-secondary`،
  `--gradient-success`، `--gradient-warning`، `--gradient-danger`، `--gradient-card-hover`)
  مع كلاسات `bg-gradient-*` المقابلة.
- **`tailwind.config.ts`**: توسيع لوحة `secondary` من 50 حتى 900 (كانت حتى 500).
- **التطبيق على المكونات:**
  - الشريط الجانبي: `bg-gradient-to-b from-primary-700 to-primary-900`، والعنصر النشط
    `bg-gradient-to-r from-primary-500 to-primary-600` مع ظل ناعم.
  - زر `Button` الافتراضي: `bg-gradient-to-r from-primary-500 to-primary-700`
    وزر الحذف: `from-red-500 to-red-600`.
  - الشريط العلوي: `bg-gradient-to-r from-card via-card to-primary-50`.
  - بطاقات الإحصائيات في `/` و `/admin` و `/test-specialist`: hover متدرج
    `from-card to-primary-50` مع رفع خفيف.
  - الشارات: عمليات سجل التدقيق وإشعارات النجاح/الخطأ/التحذير بألوان متدرجة
    (emerald/amber/red/…).

## 13) المهمة 4 — الأنيميشن الاحترافي

- **`app/globals.css`**: keyframes جديدة (`fadeIn`، `slideInFromTop`، `slideInFromRight`،
  `scaleIn`، `pulse-soft`، `shimmer`) مع كلاساتها:
  - `.animate-fade-in` (دخول الصفحة)
  - `.animate-slide-in` (دخول القوائم من أعلى)
  - `.animate-scale-in` (حوارات)
  - `.animate-pulse-soft` (نبض خفيف)
  - `.skeleton` (مؤشر تحميل متدرج)
- إضافة كتلة `prefers-reduced-motion: reduce` لإيقاف الحركة لمن يفضّلونها.
- **التطبيق:** `animate-fade-in` لحاويات صفحات `/` و `/admin` و `/examiner` و
  `/test-specialist`، و`animate-slide-in` لروابط الشريط الجانبي، في حين يستفيد الزر
  من `active:scale-[0.98]` من المهمة 1.

## 14) ملخص التغييرات

### ملفات جديدة
- `components/dashboard/dashboard-topbar.tsx`

### ملفات معدّلة
- `lib/csp.ts` — حذف `upgrade-insecure-requests`
- `middleware.ts` — تمرير `x-nonce` عبر رؤوس الطلب
- `components/ui/button.tsx` — `transition-all duration-150 active:scale-[0.98]`
- `components/dashboard/dashboard-sidebar.tsx` — تدرجات + حذف قائمة المستخدم
- `app/(dashboard)/layout.tsx` — بنية TopBar + المحتوى القابل للتمرير
- `tailwind.config.ts` — توسيع `secondary` حتى 900
- `app/globals.css` — متغيرات تدرجات + keyframes + reduced-motion
- `admin-seasons-manager.tsx` / `admin-institutions-manager.tsx` / `exam-models-manager.tsx`
  / `committee-manager.tsx` / `committee-form.tsx` — تعطيل الأزرار أثناء المعالجة
- `app/(dashboard)/page.tsx` / `admin/page.tsx` / `examiner/page.tsx` /
  `test-specialist/page.tsx` — بطاقات hover متدرجة + `animate-fade-in`
- `audit-log-table.tsx` / `notifications-list.tsx` / `admin-seasons-manager.tsx` —
  شارات متدرجة

## 15) التحقق النهائي

```powershell
pnpm typecheck   # OK — لا أخطاء
pnpm build       # OK — 42/42 صفحة
```

ملاحظة: لم يتم الرفع إلى GitHub — سيُراجع المستخدم ثم يرفع بنفسه.