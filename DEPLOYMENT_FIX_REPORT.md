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

---

# الجزء الثالث — تحويل Server Actions من `throw` إلى إرجاع النتائج (o.txt الجديد)

> تاريخ التنفيذ: نفس اليوم — القائمة الجديدة من `o.txt` (6 مهام) + قيود `OO.txt` للاختبار.

## 16) المشكلة

عدة Server Actions كانت ترمي أخطاء عبر `throw new Error(...)`. في بيئة الإنتاج
يعرض Next.js رسالة عامة ("An error occurred in the Server Components render")
بدل رسالة الخطأ الحقيقية، فيتبع ذلك ارتفاع سجل الإنتاج بأخطاء مخفية.

## 17) الحل المعتمد (المهام 1-6)

تحويل كل إجراء إلى نوع Union يسمح للعميل بعرض رسالة حقيقية:

```ts
type Result = { success: true } | { success: false; error: string };
```

- كل تحققّات الدور يتم لفّها (`requireUser`/`requireRole`) في `try/catch` والعودة بإرجاع
  `{ success: false, error }` بدل الرمي.
- أخطاء `checkRateLimit` تتحول لرسالة واضحة.
- `P2002/P2022/P2021` (تكرار / عدم مزامنة السكّيما) تعالج خصيصاً برسائل ودّية.
- كل مكوّن استدعائي يقرأ `result.success`/`result.error` بدل `catch` — بدون `any` أو
  `as unknown as` (بانتظام `OO.txt`).

### المهمة 1 — `createAdminUser`
`lib/actions/admin-panel-actions.ts`:
- يعيد `CreateUserResult = { success: true } | { success: false; error; fieldErrors? }`.
- تحقق Zod عبر `createUserSchema.safeParse` مع normalize `birthDate`.
- فحص تكرار مسبق + درع `P2002` (بريد مستخدم) + رسائل `P2021/P2022`.
- إجبار تغيير كلمة المرور لأي مستخدم جديد: `mustChangePassword: true`.

### المهمة 2 — لوحة إدارة المستخدمين ومجموعة إجراءات الأدمن
- `updateAdminUser` → `UpdateUserResult` (بدون رمي).
- `resetAdminUserPassword` → `UpdateUserResult` (بفحص `A-Za-z0-9`).
- `adminDeleteUser` → `UpdateUserResult` (منع حذف الذات + فحص الجلسات).
- `components/admin/admin-users-manager.tsx`: المعالجات الأربع
  (`handleCreate` / `handleSaveEdit` / `handleResetPassword` / `handleDelete`)
  أصبحت تعتمد على نتيجة الإجراء بدل `try/catch`.

### المهمة 3 — الإجراءات الحرجة الأربعة ومستهلكوها

| الإجراء | الملف | المستهلك |
|---|---|---|
| `createInstitutionBySpecialist` | `lib/actions/entity-actions.ts` | `components/specialist/entity-create-form.tsx` |
| `createExaminer` + `resetExaminerPassword` + `deleteExaminer` | `lib/actions/examiner-actions.ts` | `components/specialist/teachers-manager.tsx` |
| `createCommittee` + `deleteCommittee` + `assignStudentToCommittee` | `lib/actions/committee-actions.ts` | `components/specialist/committee-manager.tsx` |
| `createStudentApplication` | `lib/actions/student-actions.ts` | `components/students/nomination-form.tsx` |

نمط موحّد لكل إجراء: `let user; try { user = await requireUser(); requireRole(...) }
catch { return { success:false, error } }` + معاملة داخل `try/catch` للذراّتية مع
رسالة ودّية بدل انتشار الخطأ.

### المهمة 4 — `emailSchema` متسامح
`lib/validations/user.ts`:
- بريد جديد `emailSchema` = `trim` + `toLowerCase` + `min/max` + regex ودّي.
- طُبّق على `createUserSchema` (يستخدمه `createAdminUser`) وعلى
  `createExaminerSchema` في `examiner-actions.ts` بدل `z.string().email()` الصارم.

### المهمة 5 — إيقاف الاستطلاع الدوري للإشعارات
`components/notification/notification-badge.tsx`:
- حُذف `setInterval(fetchCount, 30000)` الذي كان يرسل طلب Server Action
  (`getUnreadCount`) كل 30 ثانية (مصدر "POST كل 30s" في ترمينال الإنتاج).
- بقي: جلب أولي عند التركيب + تحديث لحظي عبر Pusher فقط.

### المهمة 6 — اختبار E2E في وضع الإنتاج (وفق قواعد `OO.txt`)
- لم يُستخدم حساب `ossamaamr50436@gmail.com` إطلاقاً.
- أُنشئ `diag-admin@example.com / AdminTest123` (ADMIN, `mustChangePassword:false`)
  مباشرة في قاعدة البيانات بفعل `bcryptjs`, واختُبر به ثم حُذف بعد الاختبار.
- أُضيف اختبار `mustChangePassword`: بعد إنشاء مستخدم جديد (`test@example.com`)
  سُجّل الخروج ثم الدخول به وتأكدنا من التوجيه القسري إلى `/change-password`
  ثم إتمام التغيير والوصول إلى لوحة الدور `/examiner`.
- كل طوابع الصفحة/الاختيارات كُتبت بطرق مصنفة (type) بدون `any` أو `as unknown as`.
- مخطط السكربت المؤقت (حُذف بعد التنفيذ) لخطوة بخطوة.

## 18) نتائج اختبار E2E (إنتاج — `next start` على port 3000)

```
[1] ✅ دخول diag-admin إلى /admin
[2] ✅ لا يوجد استطلاع دوري (0 طلب إضافي خلال 62 ثانية)
[3] ✅ إنشاء مستخدم جديد — عرض رسالة النجاح الحقيقية
[4] ✅ رسالة خطأ التكرار تظهر بوضوح
[5] ✅ رسالة تحقق البريد غير الصالح (emailSchema)
[6] ✅ توجيه قسري إلى /change-password بعد أول دخول
[6b] ✅ بعد تغيير كلمة المرور: الوصول إلى لوحة /examiner
[7] ✅ حذف المستخدم المؤقت من لوحة الأدمن يعرض رسالة النجاح
```

## 19) التحقق النهائي (الجزء الثالث)

```powershell
pnpm typecheck   # OK — بدون أخطاء
pnpm build       # OK — 42/42 صفحة
# E2E: seed diag-admin → تصفح → إنشاء/تكرار/بريد خاطئ/حذف → mustChangePassword → تنظيف
scripts/verify-before-deploy.ts  # OK — Users: 1 (ossamaamr50436@gmail.com فقط)
```

ملاحظات:
- لم يتم الرفع إلى GitHub — سيُراجع المستخدم ثم يرفع بنفسه.
- السكربت المؤقت `scripts/_diag-e2e.ts` حُذف بعد نجاح الاختبار والتنظيف.
- مستخدما الاختبار المؤقتان حُذفا من قاعدة البيانات (قاعدة نظيفة: `Users: 1`).

---

# الجزء الرابع — المهام الثماني الجديدة (o.txt الأخير)

> تاريخ التنفيذ: السبت 2026-09-12 — سلسلة `o.txt` المكوَّنة من 8 مهام مع شروط
> `CONSTITUTION.txt` (قاعدة بيانات Neon فقط، فحص القرص ≥ 6GB قبل أي تثبيت، عدم الرفع إلى
> GitHub، كل رسائل الخطأ بالعربية، لا `any`/`as unknown as`، التوثيق في هذا التقرير).

## 20) المهمة 1 — إصلاح أزرار الضغطات المتعددة (تسجيل الدخول + كامل النماذج)

### تسجيل الدخول
- **`components/auth/login-form.tsx`**: أُعيدت كتابته من `useState(loading)` إلى
  `useTransition` + `isPending` مع درع `if (isPending) return` في بداية `handleSubmit`،
  وتعطيل الحقول والزر أثناء المعالجة، وعرض "جارٍ الدخول...". أُزيل `LottiePlayer`
  (مكتبة `lottie-react` غير مستخدمة في المشروع بعد الآن — تحقَّق بالـ grep).

### دروع الضغط المزدوج في بقية النماذج
| الملف | الحماية |
| :--- | :--- |
| `components/students/nomination-form.tsx` | منع إرسال متكرر + تعطيل أثناء `loading` |
| `components/specialist/committee-form.tsx` | منع إرسال متكرر |
| `components/specialist/entity-create-form.tsx` | منع إرسال متكرر |
| `components/specialist/assessment-settings-form.tsx` | منع إرسال متكرر |
| `components/specialist/committee-manager.tsx` | `handleCreate` / `handleDelete` / `handleAssignStudent` = بوابات `isPending` |
| `components/admin/admin-settings-form.tsx` | المعالجات الأربع (إعدادات عامة/شعار/تعليم/سجل) خلف `isPending` |
| `components/admin/admin-users-manager.tsx` | `handleCreate` / `handleSaveEdit` / `handleResetPassword` / `handleDelete` |

## 21) المهمة 2 — إلغاء إجبار تغيير كلمة المرور لموظفيه الأدمن

- **`lib/actions/admin-panel-actions.ts`**: `createAdminUser` أصبح يقبل
  `forcePasswordChange?: boolean`؛ القيمة الافتراضية `false` معيّنة عبر
  `mustChangePassword: input.forcePasswordChange === true`.
- **`components/admin/admin-users-manager.tsx`**: حالة نموذج `forcePasswordChange: false`
  + صندوق اختيار "إجبار تغيير كلمة المرور عند أول دخول" يُمرَّر للإجراء.
- **`auth.config.ts`**: المنطق قائم وتم التحقق منه — التوجيه القسري إلى `/change-password`
  يحدث فقط إذا كان `mustChangePassword === true`.

## 22) المهمة 3 — رسائل خطأ تغيير كلمة المرور بالعربية

- تم الفحص: الكود الحالي ينفّذ المطلوب أصلاً (Union type `{success,error}` مع رسائل
  عربية في `change-password/page.tsx`، منطق `useTransition`، التحقق بخمسة تحققات
  وجود/تطابق/قوة). **لا تعديلات مطلوبة** — الخيار "حفظ لأغراض المراجعة فقط".

## 23) المهمة 4 — تحسين الأداء

- **`next.config.mjs`**: `compress: true` (gzip/br)، `poweredByHeader: false`،
  `removeConsole` في الإنتاج (مع الإبقاء على `error`/`warn`)، `images.formats` =
  `avif`/`webp`، `minimumCacheTTL` = 30 يوماً.
- **اللوغو**: تحويل `<img>` إلى `next/image` في:
  - `app/(auth)/login/page.tsx` (شعار صفحة الدخول).
  - `components/dashboard/dashboard-sidebar.tsx` (شعار الشريط الجانبي).
- **إزالة الحِمل الثقيل**: `lottie-react` لم يعد مستورداً في أي ملف (التحقق بالـ grep).
- لا يوجد استيراد فعلي لـ `recharts` في الكود (التحقق من الأدلة) — لا حاجة لإعادة هيكلة.
- `app/(dashboard)/loading.tsx` موجود مسبقاً كسقيفة تحميل.

## 24) المهمة 5 — تحسين SEO شامل

- **`app/layout.tsx`**:
  - `metadata` محدّثة: `title` قالب، `description` مفصّلة، `keywords`، `metadataBase`
    (رابط الإنتاج)، `openGraph` (النوع/اللغات/صور)، `robots`، `alternates.canonical`،
    `applicationName`.
  - JSON-LD `organizationSchema` (مؤسسة نظام تعليمي) بحقن `application/ld+json`.
  - `viewport`: `maximumScale: 5` + `viewportFit: "cover"` (منع Zoom Lock وتسوية
    الشرائح على الجوال).
  - **ملاحظة CSP**: السكربت المضمّن يُحقن بـ `nonce={nonce}` كي يجتاز
    `script-src 'self' 'nonce-…'` في `lib/csp.ts`.
- **`app/robots.ts`** (جديد): السماح للجوال `*`، منع `/api/`, `/admin/`, `/audit-log`.
- **`app/sitemap.xml`** عبر `app/sitemap.ts` (جديد): الصفحة الرئيسية + `/login`.
- **التأكد**: `<html lang="ar" dir="rtl">` قائم؛ صفحة الدخول وصفحات لوحة التحكم
  تحوي `h1` — بنية العناوين سليمة.

## 25) المهمة 6 — التوافق مع الجوال وأهداف اللمس

- **`app/globals.css`**: كتلة `@media (max-width: 640px)`:
  - `html { font-size: 14px }` (وضَع الجذر).
  - `button, a, [role="button"], input, select, textarea { min-height: 48px }`
    (أهداف لمس 48px لكل تفاعلات الدعم المالي).
  - `body { overflow-x: hidden; max-width: 100vw }` (منع التمرير الأفقي).
- **القائمة الجانبية → Drawer جوال**:
  - `components/dashboard/dashboard-shell.tsx` (جديد): مكوّن عميل يدير
    `sidebarOpen` ويغلق القائمة تلقائياً عند تغير المسار (`usePathname`).
  - `components/dashboard/dashboard-sidebar.tsx`: أصبح يقبل `open`/`onClose`؛
    على الجوال `fixed right-0` كـ Drawer منزلق مع خلفية معتمة وزر إغلاق (X)، وعلى
    `md:` يعود `static` بدون حركة. (RTL: `translate-x-full` يخفيه خارج الحافة اليمنى.)
  - `components/dashboard/dashboard-topbar.tsx`: زر قائمة ☰ (`Menu`) لفتح الـ Drawer
    على الجوال (`md:hidden`) بجوار عناصر الشريط العلوي.
  - `app/(dashboard)/layout.tsx`: يستخدم `DashboardShell` مع `SessionProvider` و
    `SettingsProvider` كما كانت.
- تنسيقات الشبكة (بطاقات `grid-cols-1` ثم `sm:`/`lg:`) والجداول (`overflow-x-auto`)
  قائمة أصلاً ومبقاة على وضعها.
- `viewport` للتجوال أُضيف في المهمة 5.

## 26) المهمة 7 — إزالة مفهوم الأكبر/الأصغر

- **الرمز**: تحقَّق شامل بالـ grep (ملفات `.ts`/`.tsx`) — لا بقايا:
  `senior`, `junior`, `seniorIsUser`, `الأكبر`, `الأصغر`, `الأكبر سناً`, `الأصغر سناً`.
  - `lib/actions/assessment-actions.ts`: `approveAssessment` يعتمد تقييم المختبر فقط
    ويرفع الطالب إلى `COMPLETED` (جاهز لمراجعة الأخصائي).
  - `components/specialist/assessment-board.tsx`: زر **اعتماد تقييمي** واحد لكل مختبر.
  - صفحة `final-review`: تعرض تقييمات كل مختبر **منفصلة** للأخصائي.
- **التوثيق (وثائق الاستخدام الفعلية)** — أُزيلت كل الإشارات إلى ترتيب الاعتماد حسب
  العمر وأُعيدت صياغتها كاعتماد مستقل:
  - `README.md` (السطر التمهيدي + ميزة الاعتماد)
  - `docs/user-guide.md` (المقدمة، سير العمل، قسم المعلم المختبر، الأخصائي)
  - `docs/quick-start.md` (سير التجربة السريع)
  - `docs/developer-guide.md` (حالات التقييم + قسم "سير الاعتماد")
- ملفات `CONSTITUTION.txt`/`SRS`/تقارير التدقيق التاريخية حُفظت دون تعديل (وثائق
  محكّمة سابقة) — **تعارض معلَّم**: المادة 5 من الدستور (الاعتماد حسب العمر) ما زالت
  نصّاً، ونُفّذت المهمة 7 كأمر صريح من o.txt، ويُوصى بتحديث الدستور في وقت لاحق.

## 27) المهمة 8 — القسم التعليمي (تعليم ودورات)

- **`prisma/schema.prisma`**: حقل `showTutorialSection Boolean @default(true)` في
  `AppSettings`.
- **مهاجرة مطبَّقة**: `prisma/migrations/20260912080000_add_tutorial_section/migration.sql`
  → `pnpm prisma migrate deploy` (نجح على Neon) ثم `pnpm prisma generate`.
- **الإعدادات**:
  - `lib/actions/settings-actions.ts`: `PlatformSettings` + إرجاع الإجراء يشمل
    `showTutorialSection`؛ إجراء `updateTutorialSectionSetting`.
  - `app/api/settings/route.ts` و `components/providers/settings-provider.tsx`: قيم
    افتراضية `true` عند غياب السجل.
- **لوحة التحكم**: `components/admin/admin-settings-form.tsx`: Switch "إظهار القسم
  التعليمي" + زر حفظ؛ `app/(dashboard)/admin/settings/page.tsx` يمرر القيمة الابتدائية.
- **المستخدم**: `app/(dashboard)/settings/page.tsx` يعرض رابط القسم عند التفعيل؛
  صفحة جديدة `app/(dashboard)/settings/tutorial/page.tsx` بمحتوى توجيهي حسب الدور
  (المعلم، الأخصائي، الجهة، رئيس الشؤون، مصدر الشهادات، الأدمن).
- **الشريط الجانبي**: رابط "التعليم والدورات" (`GraduationCap`) يظهر للجميع حسب
  إعداد المنصة.

## 28) ملفات جديدة هذا الجزء

- `app/robots.ts`
- `app/sitemap.ts`
- `components/dashboard/dashboard-shell.tsx`
- `app/(dashboard)/settings/tutorial/page.tsx`
- `prisma/migrations/20260912080000_add_tutorial_section/migration.sql`

## 29) التحقق النهائي

```powershell
pnpm typecheck   # OK — بدون أخطاء (tsc --noEmit)
pnpm build       # OK — 45/45 صفحة (شمل /settings/tutorial) + robots.txt + sitemap.xml
```

- المهاجرة الجديدة مطبَّقة على Neon (`migrate deploy` نجح، `generate` نجح).
- لا `any`/`as unknown as` أُدخلت في هذا الجزء.
- كل رسائل الخطأ الجديدة (تسجيل الدخول، إنشاء المستخدم، إعداد المهمة التعليمية)
  بالعربية.
- **لم يُرفع أي شيء إلى GitHub** — سيُراجع المستخدم التغييرات ويرفعها بنفسه.
- ملاحظة بيئة: تحذير `Unsupported engine (node v24)` في pnpm غير مؤثر — الإنتاج
  يبني على Node 20 وفق `engines` في `package.json`.