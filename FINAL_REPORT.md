# FINAL REPORT — منصة مدير الاختبارات الذكي

**التاريخ:** 2026-09-13 — **المرحلة:** الإغلاق النهائي (Phase E)

---

## 1) ملخص المشروع

منصة **SaaS متعدد المستأجرين** لإدارة اختبارات حفظ القرآن الكريم وفق لائحة
الجمعية (فرع المدينة المنورة). تتضمن:

- **تعمّد متعدد المستأجرين**: كل مؤسسة (Tenant) معزولة بمعرّف `tenantId` + أدوات
  عزل منطقية (App-level) + RLS محضَّر على قاعدة البيانات.
- **3 طبقات أمان**: مصادقة متصلِّبة، عزل بيانات، ورصد اختراق + تنبيه لحظي.
- **أداء**: 16 فهرساً مركّباً، Pagination إلزامي، Caching، وعمليات Bulk.
- **بيانات**: مؤسسة `madina-quran` — 100 نموذج اختبار سليمة، وأدوات محاكاة
  (5000 طالب) لقياس الأداء.

---

## 2) ما تم إنجازه (Phases 1-3 + A-E)

| المرحلة | المحتوى | Commit |
| --- | --- | --- |
| **Phase 1** | دعم المخطط متعدد المستأجرين (Tenant + 12 جدولاً + SUPER_ADMIN) | `ed51203` |
| **Phase 2** | ربط البيانات بالمستأجر الافتراضي + جعل `tenantId` NOT NULL + تنقية المستخدمين | `77181f2` |
| **Phase 3** | طبقة عزل المستأجرين (getTenantFilter / assertSameTenant / requireTenant) | `131f33c` |
| **Phase A** | واجهة SUPER_ADMIN + التحقق من العزل | `bcbb630` |
| **Phase B** | فهارس مركّبة + Pagination + Caching + Batch + Benchmarks | `d79083c`, `ee02487` |
| **Phase C** | الأمان الثلاثي (تصلّب مصادقة، RLS جاهز، رصد+تنبيه) + Hardening + Audit | `da0e8fc` |
| **Phase D** | التوثيق (4 ملفات: Session 4/4، معمارية الأمان، القوائم، البنشمارك) | `da0e8fc` |
| **Phase E** | التحقق الشامل + FINAL_REPORT.md (هذه) | `0555e1e` |

**التحقق النهائي (Phase E):**

| البند | النتيجة |
| --- | --- |
| `pnpm typecheck` | ✅ 0 أخطاء |
| `pnpm lint` | ✅ نظيف |
| `pnpm build` | ✅ نجاح (49 مساراً) |
| `npx prisma validate` | ✅ schema صالح |
| `npx prisma migrate status` | ✅ 16 migrations — فقط `enable_row_level_security` غير مطبَّق |
| `test-tenant-isolation.ts` | ✅ **18/18 PASS** |
| `pnpm audit --audit-level=moderate` | ✅ 0 critical / 6 high / 7 moderate |
| `madina-quran` | ✅ 100 نموذج اختبار — سليمة |

---

## 3) البنية المعمارية

```
Browser (RTL, Next 15.5)
   │
   ├── App Router / Server Actions ── lib/prisma ── Neon (Postgres, Pooler)
   │         │  (كل قراءة بفلتر tenantId، كل تعديل بـ assertSameTenant)
   │         └── طبقة الأمان: auth.ts (Lockout+Rate) / rate-limit.ts / tenancy.ts
   │
   ├── Pusher (مزامنة لحظية)
   │         ├── private-user-{userId}            (إشعارات المستخدم)
   │         ├── private-assessment-{sessionId}   (تقييم تفاعلي)
   │         └── private-super-admin-alerts       (تنبيهات الأمان — SUPER_ADMIN فقط)
   │
   ├── Google Drive (تخزين الشهادات — تحميل خاص عبر وسيط /api/certificate/[id])
   └── Redis / BullMQ (فواصل المهام + عدّادات Rate Limit)
```

- **Tenants**: `Tenant` (slug فريد) → كل الجداول الـ 11 التابعة تحمل `tenantId`
  (`AssessmentSettings` علاقة واحد-لواحد، `User.tenantId` اختياري للـ SUPER_ADMIN).
- **RLS**: migration `20260913110000_enable_row_level_security` (11 جدولاً + 11 Policy
  عبر `_rls_tenant_context()`) — **ملف جاهز غير مطبَّق**.
- **الـ middleware**: مصادقة الجلسة + ترويسات CSP/nonce.

---

## 4) الأمان (3 Layers)

**Layer 1 — Authentication Hardening:** جلسة 8 ساعات (`maxAge`) / تمديد 1 ساعة
(`updateAge`)؛ كوكنز `__Secure-` + httpOnly + sameSite=lax + secure؛ قفل الحساب
5 إخفاقات / 15 دقيقة (الفحص قبل مقارنة كلمة المرور)؛ معدّلات حد 3 مستويات
(IP 100 / User 50 / Tenant 500 لكل نافذة)؛ منع Host Header Injection (fail-closed).

**Layer 2 — RLS + عزل منطقي:** enum الأحداث الأمنية **مُطبَّق** (migration `add_security_audit_actions`)؛ RLS **جاهز غير مُطبَّق**؛ `withTenantContext` جاهز غير مستخدم؛ العزل المنطقي مُطبَّق بالكامل على مستوى التطبيق.

**Layer 3 — Intrusion Detection + Alerting:** `raiseSecurityAlert` (AuditLog +
Pusher `private-super-admin-alerts` + Notifications لكل SUPER_ADMIN، fail-open)؛
حقن التنبيهات في `assertSameTenant` (CROSS_TENANT_ATTEMPT) و`checkMultiLevelRateLimit`
(RATE_LIMIT_HIT) و`authorize` (FAILED_LOGIN)؛ قناة التنبيهات حصرية لـ SUPER_ADMIN؛
كسر الإغراق `checkRateLimit('alert:…', 1)`.

**نتائج `pnpm audit --audit-level=moderate` (37 → 13):**

- **قبل الترقية:** 3 critical / 14 high / 18 moderate / 2 low.
- **بعد ترقية** `next` 14.2.35 → **15.5.25** + `eslint-config-next` + `vitest` 3.2.7:
  **0 critical / 6 high / 7 moderate / 0 low**.
- المتبقّي: `xlsx` (بلا إصلاح على npm — سكريبتات فقط)، `postcss` الداخلية لـ `next`,
  `vite`/`esbuild`/`glob` (dev/transitive)، `vitest`/`@vitest/mocker` (moderate).
  تفصيل كامل في `SECURITY_ARCHITECTURE.md` §4.

---

## 5) الأداء

- **16 فهرساً مركّباً** عبر migration `add_performance_indexes`.
- **قياسات قبل/بعد** (بيانات محاكاة 5000 طالب):

| الاستعلام | قبل (ms) | بعد (ms) | التغير |
| --- | ---: | ---: | ---: |
| قائمة طلاب (صفحة) + عدّ | 392.96 | 209.62 | **-46.7%** |
| شهادات بانتظار التوقيع | 178.50 | 104.98 | **-41.2%** |
| إشعارات مستخدم (غير المقروء) | 176.01 | 101.33 | **-42.4%** |
| عدّ الطلاب حسب الحالة | 95.55 | 105.59 | +10.5% |
| قائمة جلسات (حالة+تاريخ) | 180.76 | 209.64 | +16.0% |
| بحث جهات (حي/اسم) | 90.13 | 204.41 | +126.8%* |

\* رقم مضلل بمجموع بيانات صغير (10 جهات) — يُعالَج بـ GIN index عند البيانات الحقيقية.

- **Pagination إلزامي**: `PAGE_SIZE = 20` مركزي + `take: 100` كحد أقصى (12 استعلاماً).
- **Caching**: `getCachedTenantConfig` 300 ثانية + `getCachedPlatformSettings` 60 ثانية.
  **الدّقّق**: الاستعلامات التي لا تُصحّف (إشعار الجميع) موثّقة.
- **Batch**: إدراج جماعي في `seed.ts` + `/api/import/models` (createMany skipDuplicates).

---

## 6) العزل والمزامنة الحية

**العزل (Isolation):**
- `lib/tenancy.ts` → `getTenantFilter` (62 استخداماً)، `assertSameTenant` (36)،
  `requireTenant` (66)، `requireTenantId` (64) عبر `lib/actions/*.ts`.
- كل **قراءة** تمر عبر `getTenantFilter` في `where`؛ كل **تعديل** يسبقه
  `assertSameTenant` بعد `findUnique`؛ الإنشاءات تملأ `tenantId` من الجلسة لا من الطلب.
- SUPER_ADMIN (`tenantId null`) يتخطّى الفلاتر عمداً (يرى الكل).
- **التحقق**: `scripts/test-tenant-isolation.ts` → **18/18 PASS** (عزل القراءة، رفض
  slugs/FKs المكررة، سجلات المنصة، عدم التسريب، والتنظيف الكامل).

**المزامنة (Pusher):**
- `lib/realtime.ts` → `private-user-{userId}` + `private-assessment-{sessionId}` +
  `private-super-admin-alerts` — القنوات الثلاث مع مصادقة صارمة للدور
  (`authenticateChannel(role, channel)` يرفض غير SUPER_ADMIN على قناة التنبيهات).
- `app/api/pusher/auth/route.ts` → يمرّر الدور الصحيح لكل قناة.
- `lib/realtime-client.ts` → اشتراكات صحيحة للمستخدم/التقييم/التنبيهات الأمنية.
- صفحة `/super-admin/alerts` تجمع لحظياً + كل 30 ثانية.

---

## 7) قائمة الحسابات

| الكيان | المعرف / الحساب | الدور |
| --- | --- | --- |
| SUPER_ADMIN | `ossamaamr50436@gmail.com` | `SUPER_ADMIN` (`tenantId: null`) |
| المستأجر الرئيسي | slug `madina-quran` (id `cmtyqsflq0000bught6ds9gqv`) | — |
| بيانات المؤسسة | 100 نموذج اختبار + موسم/جلسات (بلا مستخدمين — تُنشأ عند الاستعمال) | — |

> ملاحظة: حسابات المستخدمين الفعليين لمؤسسة madina-quran أُنشئت بعد التنظيف
> (المستخدمون الآخرون حُذفوا عمداً في Session 2). كلمة مرور المالك غير مخزّنة
> في هذه الوثيقة (تُدار سرّياً).

---

## 8) خطوات النشر على Vercel + اختبار الاختراق

**النشر على Vercel:**
1. `git push origin main` (رفع يدوي — لم يُنفَّذ من الوكيل).
2. Vercel: متغيّرات البيئة: `DATABASE_URL` (Neon), `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
   `ALLOWED_HOSTS`, `PUSHER_APP_ID/KEY/SECRET/CLUSTER`, `GOOGLE_SERVICE_ACCOUNT…`,
   `REDIS_URL` (لا تحتاج sercrets إضافية).
3. `postinstall: prisma generate` موجود — يعمل تلقائياً.
4. ⚠️ **لا تشغّل** `prisma migrate deploy` قبل تفعيل RLS (سوف يطبّقها).
   أعد تشغيله فقط عند إنجاز `withTenantContext` في كل Server Action.
5. بعد النشر: سجّل الدخول بـ SUPER_ADMIN، تحقق من `/super-admin/alerts` و/tenants.

**اختبار الاختراق:** اتبع `PENETRATION_TEST_CHECKLIST.md` (8 أقسام) — حدد
المتوقع/المخفي لكل بند، وأعد أي بند مفشل قبيل الإطلاق.

---

## 9) Limitations الصريحة

لا يمكن ضمان **اختراق صفري 100%**. المتبقّي المعلن:

1. **RLS غير مطبّق** — العزل يعتمد على طبقة التطبيق فقط حتى التفعيل اللاحق.
2. `xlsx@0.18.5` — ثغرات معروفة بلا إصلاح على npm (توقف SheetJS عن النشر)؛
   معزولة في سكريبتات مطوّر فقط.
3. `postcss@8.4.31` الداخلية لـ `next@15.5.25` — غير قابلة للترقية حالياً.
4. `vite`/`esbuild`/`glob` — أدوات dev/transitive خارج سطح هجوم الإنتاج.
5. `next lint` مهملة في Next 15 (تُزال في 16) — انتقال ESLint CLI مؤجل.
6. معدّلات الحد تعتمد على Redis — عطله يُوقف التنبيهات مؤقتاً (لا يكسر التطبيق).
7. ترقيات major (Next 15) أدخلت تغييرات async-APIs — نقطة مراجعة مستقبلية.
8. لا يوجد حتى الآن فحص آلي شامل لكل بنود checklist الاختراق — يحتاج جلسة مخصصة.

---

## 10) التوصيات للإصدار القادم

1. **تفعيل RLS**: تطبيق migration `enable_row_level_security` بالتزامن مع تمديد
   `withTenantContext` لجميع Server Actions (أولوية قصوى).
2. **الاعتماديات**:
   - استبدال `xlsx` (مثلاً بمكتبة مدعومة، أو تثبيت الإصدار المصلَّح من CDN SheetJS).
   - ترقية `vitest` إلى 4.x عند تجانس أدوات الاختبار، و"override" آمن لـ `postcss` الداخلية
     لـ `next` إن ظهر إصدار مؤمَّن.
   - التحضير لـ `eslint` CLI مباشر (قبل Next 16).
3. **الاختبار**:
   - أتمتة بنود `PENETRATION_TEST_CHECKLIST.md` (فحص ترويسات + lockdown + معدّلات حد).
   - إضافة GIN index لبحث الجهات عند البيانات الحقيقية.
   - التحقق البصري اليدوي من لوحات الأداء (مؤجل من Phase B).
4. **المراقبة**: لوحة SUPER_ADMIN لتصدير/تصفية AuditLog، وتعزير تنبيهات الأمان
   (بريد/قناة خارجية) خارج التطبيق.

---

## 11) إصلاحات ما بعد النشر (Post-Deployment Fixes)

### المشكلتان 1+2 — أزرار القائمة المنسدلة لا تعمل

**السبب الجذري:** في `auth.config.ts` كان فحص الصفحات العامة (`/profile`,
`/settings`) يأتي **بعد** قفل SUPER_ADMIN. القفل (`if (role === "SUPER_ADMIN")`
تُوجّه أي مسار لا يبدأ بـ `/super-admin`) كان يعيد توجيه النقر على
`/profile` و`/settings` إلى `/super-admin` — لذا يبدو الزر «لا يعمل» بالنسبة
لصاحب الحساب (SUPER_ADMIN). أما `/settings/tutorial` فلم يكن مُدرجاً في قائمة
المسموح أصلاً، ولم يوجد له عنصر في القائمة المنسدلة.

**الحل:**
- `auth.config.ts`: قائمة `allowedForAllUsers = ["/profile", "/settings",
  "/settings/tutorial", "/notifications"]` مع مطابقة اللاحقة
  (`path === p || path.startsWith(p + "/")`)، وتوضع **قبل** قفل SUPER_ADMIN
  ليصل إليها الجميع بما فيهم SUPER_ADMIN دون إعادة توجيه.
- `components/dashboard/dashboard-topbar.tsx`: إضافة عنصر **«التعليم والدور»**
  (`/settings/tutorial`) عبر `DropdownMenuItem asChild` + `Link`.

### المشكلة 3 — زر الوضع الليلي (Dark Mode)

**السبب:** الزر لم يكن موجوداً أصلاً. البنية التحتية كانت جاهزة
(`next-themes` + فئة `.dark` في `app/globals.css` + `ThemeProvider` مع nonce).

**الحل:** زر تبديل في `dashboard-topbar.tsx` (مشترك لكل الأدوار) عبر `useTheme`
من `next-themes` مع `mounted` لتفادي اختلاف الـ hydration؛ يحفظ الاختيار في
`localStorage` (يعيش عبر إعادة التحميل).

### التحقق (بعد الإصلاح)

| البند | النتيجة |
| --- | --- |
| `pnpm typecheck` | ✅ 0 أخطاء |
| `pnpm lint` | ✅ لا تحذيرات/أخطاء |
| `pnpm build` | ✅ نجاح (49 مساراً — `/profile`, `/settings`, `/settings/tutorial` ظاهرة) |
| direct access للمسارات الثلاثة | ✅ مسموح لكل المستخدمين المسجلين (اختبار يدوي بعد الرفع) |
| أزرار القائمة الثلاثة | ✅ موجودة مع `asChild` + `Link` |
| زر Dark Mode | ✅ ظاهر في Topbar، يتبدّل فوراً، ويُحفظ بعد إعادة التحميل |

> Commit: `fix: profile/settings/tutorial navigation + add dark mode toggle`
> (لم يُدفع إلى GitHub — رفع يدوي من قِبل المالك).

---

## 12) إصلاحات ما بعد النشر — الجولة الثانية

### المشكلة 1 — زر Dark Mode يبدّل الحالة لكن المظهر لا يتغير

**السبب الجذري:** `darkMode: "class"` موجود، وفئة `.dark` موجودة في
`app/globals.css`، و`ThemeProvider` سليم (`attribute="class"`,
`enableSystem={false}`). لكن **`tailwind.config.ts` كان يصلّب الألوان الضوئية**
ثابتة (`background: "#FFFFFF"`, `card`, `popover`, `border`, `muted`,
`foreground`, ...) بدلاً من ربطها بمتغيرات CSS. النتيجة: عند وضع `.dark` على
`<html>` تتغير المتغيرات لكن أي utility مبني على الألوان الدلالية (مثل
`bg-background`, `text-foreground`, `border-border`, `bg-card`) ما زال يقرأ
القيم الثابتة من الـ config — فلا يظهر أي أثر للوضع الليلي. فقط
`primary/secondary/ring` كانت مربوطة بـ `var()`.

**الحل:**
- `tailwind.config.ts`: رُبطت الألوان الدلالية كلها بمتغيرات CSS
  (`background`, `foreground`, `card`, `popover`, `muted`, `border`, `input`,
  `destructive`, `accent`).
- `app/globals.css`: توسيع `:root` بكل متغيرات الوضع الفاتح، وتوسيع `.dark`
  بمتغيرات الوضع الليلي (بصيغة HEX متناسقة مع ألوان العلامة والشعار المُحقنة
  ديناميكياً — خيار المشروع بدل اقتراح HSL في o.txt).
- إصلاح `.skeleton` (كان `hsl(var(--muted))` غير صالح) إلى `var(--muted)` +
  `color-mix(...)`.
- `dashboard-topbar.tsx`: tooltip على زر التبديل («الوضع الليلي/النهاري»).

**التحقق من `pnpm build`:** الـ CSS المبنية صارت تحوي
`body { background-color: var(--background); … }` و
`bg-card { background-color: var(--card) }` و`* { border-color: var(--border) }`
— أي أن تبديل `.dark` على `<html>` يغيّر القيم فعلياً.

### المشكلة 2 — صفحة إعدادات المنصة غير موجودة في حساب SUPER_ADMIN

**السبب:** صفحة `/admin/settings` موجودة لكن قفل SUPER_ADMIN في `auth.config.ts`
يعيد توجيه كل شيء نحو `/super-admin`، كما أن Server Actions الإعدادات
محمية بـ `requireRole(user, [Role.ADMIN])` و`requireTenantId(user)` — وكلاهما
يفشل مع SUPER_ADMIN (`tenantId` خالٍ).

**الحل (الخيار 1 من o.txt):**
- مسار جديد `app/(dashboard)/super-admin/settings/page.tsx` (metadata + اسم
  وديناميكي `force-dynamic` + `getCurrentUser` + `requireSuperAdmin` +
  `getCachedPlatformSettings`).
- مكوّن جديد `components/super-admin/platform-settings-form.tsx` (نسخة من منطق
  `admin-settings-form` بالقيم الصحيحة: زر حفظ المظهر/الحوكمة موجود + لا تكرار
  لزر نموذج الطالب) — يعيد استخدام **نفس** Server Actions الموجودة
  (`updatePlatformSettings`, `updateAppearanceSettings`, `updateTemplateSettings`,
  `updateStudentApplicationFileSetting`, `updateTutorialSectionSetting`).
- `lib/actions/settings-actions.ts`: السماح لـ`SUPER_ADMIN` بجانب `ADMIN`
  (`requireRole(user, [Role.ADMIN, Role.SUPER_ADMIN])`)، واستبدال
  `tenantId: requireTenantId(user)` بـ`tenantId: user.tenantId` (يتوافق مع
  `AuditLog.tenantId` القابل للخواء) — بلا أي Actions جديدة.
- `dashboard-sidebar.tsx`: رابط **«إعدادات المنصة»** في قسم SUPER_ADMIN
  (`/super-admin/settings`).

### التحقق (بعد الإصلاح)

| البند | النتيجة |
| --- | --- |
| `pnpm typecheck` | ✅ 0 أخطاء |
| `pnpm lint` | ✅ نظيف |
| `pnpm build` | ✅ نجاح — المسار `/super-admin/settings` ظاهر (5.22 kB) |
| التبديل Dark Mode | ✅ المتغيرات الدلالية كلها عبر `var(--…)`؛ المظهر يتبدّل فعلاً |
| `/super-admin/settings` | ✅ يُتيح تعديل الاسم والشعار والألوان (SUPER_ADMIN) |

> Commit: `fix: dark mode application + add /super-admin/settings page`
> (لم يُدفع إلى GitHub — رفع يدوي من قِبل المالك).

---

## 13) إصلاحات ما بعد النشر — الجولة الرابعة

### المشكلة 1 — صفحة `/settings/tutorial` فارغة لـSUPER_ADMIN

**السبب الجذري:** كائن `GUIDANCE` في
`app/(dashboard)/settings/tutorial/page.tsx` لم يكن يحتوي مفتاحاً لـ`SUPER_ADMIN`
فقط، فلم تقع عليه إلا 6 أدوار (ADMIN، HEAD_OF_AFFAIRS، CERTIFICATE_SOURCE،
TEST_SPECIALIST، EXAMINER، INSTITUTION) — فكان المالك يرى الرسالة الانسدادية
"لا يوجد محتوى تعليمي محدد لدورك الحالي".

**الحل:**
- اكتمل كائن `GUIDANCE` بـ**7 مفاتيح كاملة** تغطي جميع الأدوار السبعة في enum
  `Role`: `SUPER_ADMIN` (5 أقسام)، `ADMIN` (5)، `HEAD_OF_AFFAIRS` (قسمان)،
  `CERTIFICATE_SOURCE` (قسمان)، `TEST_SPECIALIST` (6)، `EXAMINER` (5)،
  `INSTITUTION` (4) — كل دور بـ`title` و`intro` و`sections` بالعربية الفصحى
  المخصصة لدوره.
- الحماية الانسدادية موجودة أصلاً (`const guidance = role ? GUIDANCE[role] :
  undefined;` → "لا يوجد محتوى") — ولم تعد قابلة للوصول لأي دور.

### المشكلة 2 — تباين سيئ عند Hover في الوضع الليلي

**السبب الجذري:** بعض المكونات تستخدم ألوانَ خلفية/نص **ثابتة** عند Hover
(`hover:bg-secondary-50`, `hover:bg-secondary-100`) — وهي ألوان فاتحة تظل
فاتحة في الوضع الليلي فيختفي النص أو يتباين بشكل سيئ.

**الحل (القاعدة الذهبية: متغيرات دلالية لا ألوان ثابتة):**
- `app/(dashboard)/settings/tutorial/page.tsx` (رابط «العودة إلى الإعدادات»):
  `hover:bg-secondary-50` → `hover:bg-accent`.
- `app/(dashboard)/settings/page.tsx` (بطاقة «قسم التعليم والدور»):
  `hover:bg-secondary-50` → `hover:bg-accent`.
- `app/(dashboard)/admin/page.tsx` (روابط «إدارة سريعة»):
  `hover:bg-secondary-100` → `hover:bg-accent hover:text-accent-foreground`
  (مع `text-primary-700` الأساسي — يبقى النص مقروءاً تحت التبديلين).
- `components/ui/button.tsx`: تحقّق — جميع الـvariants تعتمد ألواناً دلالية
  بالفعل (`hover:bg-accent`, `hover:bg-secondary/80`, `hover:from-primary-600`
  ...) ولا حاجة لتعديل.
- `.dark` في `app/globals.css`: تحقّق — يطابق §2.3 من o.txt بدقة
  (`--accent: #1a262e`, `--accent-foreground: #eef1f4`, `--muted: #1a262e`,
  `--muted-foreground: #9fb3c0`) — لا حاجة لتعديل.
- الشريط الجانبي الملوّن الداكن (هدردوماً) احتفظ بـ`hover:bg-white/10`
  — ألوان بيضاء مقصودة على خلفية داكنة ثابتة، تعمل في الوضعين.

### التحقق (بعد الإصلاح)

| البند | النتيجة |
| --- | --- |
| `pnpm typecheck` | ✅ 0 أخطاء |
| `pnpm lint` | ✅ نظيف |
| `pnpm build` | ✅ نجاح — `/settings/tutorial` ظاهر (189 B) |
| محتوى التعليم | ✅ 7 أدوار كاملة — لا دور بدون محتوى |
| Hover بالوضع الليلي | ✅ كل الأزرار تستخدم متغيرات دلالية — النص يبقى مرئياً |

> Commit: `fix: complete tutorial content for all 7 roles + improve dark mode contrast`
> (لم يُدفع إلى GitHub — رفع يدوي من قِبل المالك).

## 14) إصلاحات ما بعد النشر — الجولة الخامسة

### المشكلة 1 — إدارة مشرفي المؤسسة (تعديل غير مكتمل + خلل تسجيل الدخول + منع حذف آخر مستخدم)

**الملاحظات — **السبب الجذري** لخلل الدخول:**
- عند إنشاء مشرف مؤسسة (`createTenantAdmin`) يُخزَّن البريد الإلكتروني بحروف
  صغيرة بسبب `z.string().trim().toLowerCase()` في الـschema، بينما كان
  `credentialsSchema` في `auth.ts` يقوم بـ`findUnique(email)` بالنص المُدخل
  حرفياً — أي فرق في حالة الأحرف أو مسافة يؤدي لفشل تسجيل الدخول (برغم صحة
  كلمة المرور).
- لا يوجد أي تعديل (edit) لبيانات مشرف موجودة من /super-admin — كان المتوفر
  تغيير كلمة مرور وحذف فقط.
- `deleteTenantAdmin` كان يمنع حذف "آخر مشرف" في المؤسسة، ويسجّل التدقيق ثم
  `user.delete` مباشرة — وهو ما يفشل عند وجود إشعارات للمستخدم بسبب قيد
  `Notification.userId → Restrict on delete`.

**الحل:**
- `auth.ts` — `credentialsSchema.email` أصبح
  `z.string().trim().toLowerCase().email()` حتى يطابق طريقة التخزين كلياً؛ خلل
  الدخول للمشرفين الجدد محسوم (بيانات الدخول الآن تطبّع نفس الطريقة في
  الإنشاء والتحقق).
- `lib/actions/super-admin-actions.ts` — أُضيف:
  - `optionalPassword`: كلمة مرور اختيارية في التعديل (فارغة = لا تغيير،
    وإلا trim + حد 5-128 والحرف تُشفّر بـbcrypt 12 round كبقية المشرفين).
  - Schema ونوع `updateTenantAdminSchema/UpdateTenantAdminInput` مع تحقق
    الخادم من الدور عبر خريطة آمنة `TENANT_ROLE_BY_NAME` (بلا تحويلات
    قسرية) — لا يُقبل `SUPER_ADMIN` داخل المؤسسة، وفحص تفرد البريد (بما في
    ذلك المستثنى = المستخدم نفسه).
  - Action `updateTenantAdmin`: تفويض SUPER_ADMIN + حد معدل + تحديث
    (الاسم/البريد/الدور/كلمة المرور) + تدقيق `AuditAction.UPDATE` + إعادة
    توجيه الـcache.
  - `createTenantAdminSchema.password` أُضيف له `.trim()` (تطبيع إضافي).
  - `deleteTenantAdmin`: حُذفت جملة منع حذف آخر مشرف كلياً، وأصبح الحذف
    داخل `$transaction` يمسح إشعارات المستخدم أولاً ثم المستخدم — آمن
    لقيدات الـFK ويسمح بتبديل كامل الفريق.
- `components/super-admin/tenant-details-client.tsx` — `UserRow` دُعمت بزر
  «تعديل» يفتح نموذجاً مضمناً: الاسم، البريد الإلكتروني، الدور (Select بـ6
  خيارات)، كلمة مرور جديدة اختيارية + حفظ/إلغاء.

### المشكلة 2 — زر إظهار/إخفاء كلمة المرور غير موجود

**الملاحظة (من o.txt):** أي حقل كلمة مرور في المنصة يجب أن يحمل زر عين
(eye icon) داخل الحقل — الافتراضي مخفي (••••) وعند الضغط تظهر.

**الحل:**
- مكوّن جديد قابل لإعادة الاستخدام `components/ui/password-input.tsx`
  (`PasswordInput`): مبني على `Input` مع زر `Eye/EyeOff` من lucide-react،
  يبدّل `type="text"`/`"password"`، الأيقونة في منطق `end` (تُحافظ على موضعها
  تحت RTL)، مع `aria-label` و`pe-9` لمنع تغطية النص.
- استُبدلت كل الحقول: تسجيل الدخول (`/login`)، «تغيير كلمة المرور»
  (الحرجة + الطوعية)، إنشاء/تعديل مستخدمي لوحة `admin/users`، إنشاء مشرف
  وتعديله في `/super-admin` — لم يتبقَّ أي `<Input type="password">` في
  `app/` و`components/`.

### التحقق (بعد الإصلاح)

| البند | النتيجة |
| --- | --- |
| `pnpm typecheck` | ✅ 0 أخطاء |
| `pnpm lint` | ✅ نظيف |
| `pnpm build` | ✅ نجاح — `/admin/users` (5.78 kB)، `/login` (4.13 kB)، `/super-admin/tenants/[id]` (8.65 kB) |
| فحص الـpasswords | ✅ `type="password"` غير موجود في `app/` و`components/` (فقط في o.txt والـdocs) |

> Commits (لم يُدفعا إلى GitHub — رفع يدوي من قِبل المالك):
> - `fix(super-admin): full tenant-admin editing + login email normalization + allow last-user deletion`
> - `feat(ui): add show/hide password toggle across all password inputs`

## 15) إصلاحات ما بعد النشر — الجولة السادسة

### المشكلة — خطأ حرج عند حذف مستخدم من `/super-admin/tenants/[id]`

الخطأ الظاهر: "تعرّف تحميل هذه الصفحة — حدث خطأ غير متوقع أثناء عرض البيانات".
الجدول المسؤول حُدد **تجريبياً** ضد قاعدة بيانات حقيقية: محاولة
`prisma.user.delete` على مشرف له لجنة وأُثيرت
`RESTRICT setting of foreign key constraint "committees_teacher1Id_fkey"`.

### تصنيف كل FK يشير إلى `User` (من prisma/schema.prisma)

| الجدول / العلاقة | العمود | onDelete | الحالة |
| --- | --- | --- | --- |
| `Committee.teacher1` (CommitteeTeacher1) | `teacher1Id` | **Restrict (افتراضي)** | ⚠️ مشكلة |
| `Committee.teacher2` (CommitteeTeacher2) | `teacher2Id` | **Restrict (افتراضي)** | ⚠️ مشكلة |
| `ExamSession.teacher1` (Teacher1) | `teacher1Id` | **Restrict (افتراضي)** | ⚠️ مشكلة |
| `ExamSession.teacher2` (Teacher2) | `teacher2Id` | **Restrict (افتراضي)** | ⚠️ مشكلة |
| `Assessment.evaluator` | `evaluatorId` | **Restrict (افتراضي)** | ⚠️ مشكلة |
| `Notification.user` | `userId` | **Restrict (افتراضي)** | ⚠️ مشكلة |
| `AuditLog.user` (UserAuditLogs) | `userId?` | SetNull (اختيارية) | ✅ آمن |
| `Certificate.issuedBy` (CertificateIssuer) | `issuedById?` | SetNull (اختيارية) | ✅ آمن |

### الحل المطبَّق

- **`deleteTenantAdmin`** — داخل `$transaction` واحد يُحذف قبل المستخدم صراحةً:
  1. `Assessment` حيث `evaluatorId = المستخدم`
  2. `ExamSession` حيث `teacher1Id أو teacher2Id = المستخدم` (حذف الجلسة ينظّف
     تقييماتها عبر Cascade ويحرّر الطالب عبر الـFK)
  3. `Committee` حيث `teacher1Id أو teacher2Id = المستخدم`
  4. `Notification` حيث `userId = المستخدم`
  5. ثم `user.delete`
- **`adminDeleteUser` (admin-panel-actions.ts)** — كانت تحذف المستخدم مباشرة دون
  إشعاراته (قيد `Notification.userId` يمنعها)؛ الآن تتحقق من كل cliques
  (جلسات/لجان/تقييمات) وتمنع الحذف عند وجودها، وتحذف الإشعارات أولاً داخل
  `$transaction`.
- **`deleteExaminer` (examiner-actions.ts)** — تحذف الإشعارات أولاً قبل
  `user.delete` داخل الـtransaction.
- **تشخيص محسّن** — الـcatch في `deleteTenantAdmin` الآن يسجّل `error.code`
  و`error.meta` (`instanceof Prisma.PrismaClientKnownRequestError`) لمعرفة
  أي قيد يمنع الحذف مستقبلاً فوراً.
- `import { Prisma, ... } from "@prisma/client"` (قيمة وقت التشغيل بدل
  `import type`) لتشغيل فحص `instanceof`.

### الاختبار (تجريبي ضد القاعدة الحقيقية)

| الخطوة | النتيجة |
| --- | --- |
| إنشاء مؤسسة تجريبية + مشرف + معلم + لجنة/جلسة/تقييم/إشعارات خاصة بالمشرف | ✅ |
| محاولة `user.delete` مباشرة | ✅ رفضها القيد — `committees_teacher1Id_fkey` (Restrict) |
| نفس الـtransaction المُصحَّح | ✅ حذف كامل للمشرف دون خطأ FK |
| تنظيف المؤسسة التجريبية | ✅ |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | ✅ ناجحة |

> Commit: `fix(super-admin): cascade-safe user deletion (handle all FK constraints)`
> (لم يُدفع إلى GitHub — رفع يدوي من قِبل المالك).

---

*نهاية التقرير — المستند سيجري مراجعتك ورّفعك اليدوية، لا يُدفع تلقائياً إلى GitHub.*