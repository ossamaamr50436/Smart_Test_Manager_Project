# معمارية الأمان (Security Architecture) — Phase C

وثيقة مرجعية لطبقات الأمان الثلاث المنفّذة في **Phase C**، وقراراتها، وسجلّ
التدقيق (Audit) الحالي، والقيود الصريحة.

---

## 1) الطبقات الثلاث (Three Layers)

### Layer 1 — Authentication Hardening (تصلّب المصادقة)
| البند | الحالة | التفاصيل |
| --- | --- | --- |
| مدة الجلسة | ✅ | `maxAge: 8h`، `updateAge: 1h` (إعادة تمديد نشطة) في `auth.config.ts`. |
| Cookies الجلسة | ✅ | `__Secure-next-auth.session-token` + `httpOnly` + `sameSite: "lax"` + `secure` في الإنتاج (تُضاف البادئة `__Secure-` تلقائياً في HTTPS). |
| قفل الحساب (Lockout) | ✅ | 5 محاولات فاشلة خلال 15 دقيقة → قفل مؤقت 15 دقيقة، الفحص **قبل** مقارنة كلمة المرور (`auth.ts`)، والتسجيل كـ `FAILED_LOGIN`. |
| Rate limit — الدخول | ✅ | `login:{email}` 10/15د + `login-ip:{ip}` 50/15د (مضاد brute force). |
| Host Header Injection | ✅ | `assertAllowedHostHeader` ـ fail-closed في `authorize` + قائمة `ALLOWED_HOSTS`. |

### Layer 2 — RLS + عزل منطقي (Tenancy Isolation)
| البند | الحالة | التفاصيل |
| --- | --- | --- |
| العزل المنطقي (App-level) | ✅ | `getTenantFilter` + `assertSameTenant` + `requireTenantId` في كل Server Actions (Session 3). |
| RLS على قاعدة البيانات | ⏸️ **محضَّر — غير مطبَّق** | ملف `20260913110000_enable_row_level_security` جاهز (11 جدولاً + 11 Policy). |
| Utility جاهز للتطبيق | ✅ | `lib/tenancy-db.ts` → `withTenantContext(user, fn)` عبر `$transaction` + `set_config('app.tenant_id', …)`. |
| Enum أحداث أمنية | ✅ | `SUSPICIOUS_ACCESS`, `RATE_LIMIT_HIT`, `CROSS_TENANT_ATTEMPT`, `FAILED_LOGIN` (migration enum **مطبَّق**). |

> قرار RLS التفصيلي في القسم 3.

### Layer 3 — Intrusion Detection + Alerting (المراقبة والإنذار)
| البند | الحالة | التفاصيل |
| --- | --- | --- |
| `raiseSecurityAlert(payload)` | ✅ | AuditLog (`tenantId: null`) + Pusher `private-super-admin-alerts` + Notifications لكل `SUPER_ADMIN`؛ فشل أي قناة لا يُفشل الطلب (try/catch). |
| حقن التنبيهات | ✅ | `assertSameTenant` → `CROSS_TENANT_ATTEMPT`؛ `checkMultiLevelRateLimit` → `RATE_LIMIT_HIT`؛ `authorize` → `FAILED_LOGIN`. |
| إخلاء القنوات | ✅ | `app/api/pusher/auth/route.ts` يمرّر دور المستخدم؛ قناة `private-super-admin-alerts` حصرية لـ `SUPER_ADMIN`. |
| واجهة المراقبة | ✅ | `/super-admin/alerts` مع الاشتراك اللحظي (حدث `security:alert`) + تجميع كل 30 ثانية. |
| كسر الإغراق | ✅ | كل تنبيه يتكرر مرة واحدة لكل نافذة (`checkRateLimit('alert:…', 1)`) — لا إغراق عبر زر تنبيه مكرر. |

---

## 2) جدول التهديدات (Threat Matrix) — 12+ تهديداً

| # | التهديد | الطبقة | الإجراء/التخفيف | الحالة |
| --- | --- | --- | --- | --- |
| 1 | سرقة جلسة / كوكنز | L1 | `httpOnly` + `secure` + `sameSite=lax` + صلاحية 8 ساعات | ✅ منفّذ |
| 2 | Brute force / تخمين كلمة المرور | L1+3 | قفل 5/15د + معدّل حد على البريد وIP + تنبيه `FAILED_LOGIN` | ✅ منفّذ |
| 3 | Host Header Injection | L1 | تحقق fail-closed من `Host`/`x-forwarded-host` في الدخول | ✅ منفّذ |
| 4 | IDOR / وصول مستعرض بين المستأجرين | L2 | `getTenantFilter` + `assertSameTenant` + فلاتر `tenantId` في كل القراءات/الكتابات | ✅ منفّذ |
| 5 | تزوير `tenantId` (Mass Assignment) | L2 | الكتبات تملأ `tenantId` من الجلسة (`requireTenantId`) لا من الطلب | ✅ منفّذ |
| 6 | تجاوز العزل عبر DB/Pooler مباشر | L2 | RLS جاهز غير مطبَّق → يفترض الاعتماد على طبقة التطبيق حالياً | ⏸️ مؤجَّل (قرار مكتوب) |
| 7 | إغراق الطلبات (Rate abuse) | L1+3 | `checkMultiLevelRateLimit`: IP 100 / User 50 / Tenant 500 لكل نافذة + `RATE_LIMIT_HIT` | ✅ منفّذ |
| 8 | XSS (حقن سكريبت) | H | CSP عبر nonce + `X-Content-Type-Options: nosniff` | ✅ منفّذ |
| 9 | Clickjacking | H | `X-Frame-Options: DENY` | ✅ منفّذ |
| 10 | MIME sniffing / تنزيل غير مقصود | H | `X-Download-Options: noopen` + `X-Permitted-Cross-Domain-Policies: none` | ✅ منفّذ |
| 11 | اعتماديات ملوّثة / Supply Chain | H | `pnpm audit` + ترقية مباشرة حرجة (راجع القسم 4) | ✅ بأثر جارٍ |
| 12 | تسريب بيانات عبر سجلّات (Logs) | L3 | AuditLog لاحتياج رقابي؛ التفاصيل الحسّاسة لا تُكتب أصلاً | ✅ منفّذ |
| 13 | تعطيل الخدمة بالتنسيق (DoS) | L1 | معدلات أمّاكن على مستوى IP+User+Tenant | ✅ منفّذ |
| 14 | نشاط إداري مريب | L3 | كل مؤشرات الاختراق تُنبّه SUPER_ADMIN لحظياً | ✅ منفّذ |

H = Hardening (ترويسات الأمان في `next.config.mjs`).

---

## 3) قرار RLS + السبب

**القرار:** إنشاء migration `enable_row_level_security` بصيغة `--create-only`
(ملف فقط) — **وليس** تطبيقه الآن.

**التفاصيل:**
- الملف يتضمن `ENABLE` + `FORCE ROW LEVEL SECURITY` على 11 جدولاً
  (institutions, students, exam_seasons, committees, exam_models, exam_sessions,
  assessment_settings, assessments, certificates, notifications, audit_logs)
  و `CREATE POLICY tenant_isolation_<table>` يعتمد `current_setting('app.tenant_id')`.
- دلالات السياق: `''` (خالية) = SUPER_ADMIN يرى الكل؛ غير مضبوط (`NULL`) = **fail-closed**.
- الجداول المستثناة عمداً: `users` (بحث الدخول العام)، `tenants` (قوائم المنصة)،
  `app_settings` (عامة)، `rate_limits` (عالمية)، `committee_model_allocations` (ولها
  قيد فريد مشتق من بيانات المعرّفات).

**السبب (قرار معماري إلزامي):** في الإطار الحالي تمر كل الكتابات عبر **Neon Pooler**
الاتصالية مع إعادة توجيه المُعاملة مباشرة، ولا تحمل الجلسات سياق `app.tenant_id`
إلا إذا غُلّف كل Server Action بـ `withTenantContext` — وهو عمل ضخم يؤجَّل للإصدار
التالي. **الحالي:** العزل المنطقي (Layer 2 app-level) مطبّق بالكامل، والـ RLS جاهز
كمّصاصة أخيرة عند التطبيق.

---

## 4) نتائج `pnpm audit --audit-level=moderate`

بعد ترقية `next` 14.2.35 → **15.5.25** و`eslint-config-next` → 15.5.25 و`vitest` → 3.2.7:

- **قبل:** 3 critical / 14 high / 18 moderate / 2 low = **37 ثغرة**.
- **بعد:** 0 critical / 6 high / 7 moderate / 0 low = **13 ثغرة**.

### المتبقّي (مصنَّف — كلها transitive أو بلا إصلاح على npm)

| الحزمة | الخطورة | النوع | السبب/التعامل |
| --- | --- | --- | --- |
| `xlsx@0.18.5` (×2) | high | **مباشر** | علامة `<0.0.0` = **لا إصلاح على npm** (SheetJS توقّفت عن النشر، الإصلاح على CDN فقط). تُستخدم في `scripts/` (أدوات تطوير فقط، خارج bundle الإنتاج) → وثّق. |
| `postcss@8.4.31` (×4) | high/moderate | عبر `next@15.5.25` | نسخة داخلية يستجرّها Next ذاتياً؛ نسخة المشروع المباشرة `postcss@8.5.26` سليمة. لا يمكن تجاوز الداخلية بـ override آمن → وثّق. |
| `vite@5.4.21` (×3) | high/moderate | عبر `vitest` | أدوات تطوير/اختبار فقط (ليست في الإنتاج) → وثّق. |
| `esbuild@0.21.5` | moderate | عبر `vite → vitest` | أدوات تطوير فقط → وثّق. |
| `glob@10.3.10` | high | عبر `googleapis → … → rimraf` | transitive → وثّق. |
| `vitest@3.2.7` | moderate | **مباشر (dev)** | moderate → وثّق فقط (سياسة o.txt). |
| `@vitest/mocker` | moderate | عبر `vitest` | transitive → وثّق. |

**سياسة o.txt:** Critical/High مباشر → حدّث ✅ (تمّ). Critical/High transitive → وثّق ✅.
Moderate → وثّق فقط ✅. لا يوجد مباشر critical/high باقٍ **له إصلاح ممكّن**.

---

## 5) القيود الصريحة (Limitations)

لا يمكن ضمان **اختراق صفري 100%** — هذه الوثيقة تلتزم بالصدق بشأن الثغرات المفتوحة:

1. **RLS غير مطبَّق** على قاعدة البيانات حالياً — العزل يعتمد كلياً على طبقة التطبيق
   (`getTenantFilter`/`assertSameTenant`)؛ إن وُجد Backdoor في App Layer فهو كافٍ للتجاوز.
2. `xlsx@0.18.5` — ثغرات معروفة (prototype pollution + ReDoS) بلا إصلاح على npm؛
   التأثير محدود بالسكريبتات التطويرية **لكنه قائم** حتى استبدال الحزمة.
3. `postcss@8.4.31` الداخلية لـ `next@15.5.25` — ثغرات moderate/high، غير قابلة
   للترقية إلا بترقية Next لاحقاً (لا override آمن معروف لهذه النسخة).
4. `vite`/`esbuild`/`glob` — أدوات dev/transitive، لا تنزع خطورتها لكنها خارج سطح
   الهجوم الإنتاجي الأساس.
5. ترقيات **major** تُدخل تغييرات كاسرة: `next` 15 غيّرت async request APIs
   (`headers()`/`params`/`searchParams`) — راجع النقاط المؤقتة في مستوى الطلب.
6. معدّلات الحد تعتمد على **Redis/Bull** — عُطّل Redis يعني تعطّل التنبيهات/الحدود
   مؤقتاً (لا إنكار خدمة للتطبيق نفسه).
7. قناة Pusher الخاصة تعتمد على قدرة المتصفح على الواجهة؛ الملاحظات المزدوجة
   (Audit + Notification) تبقى مصدر الحقيقة حتى عند غياب الاتصال اللحظي.
8. `next lint` انتهت صلاحيتها في Next 15 (ستُزال في 16) — الترقية إلى ESLint CLI
   المباشر أعمال مؤجلة.
9. صناعة الأمان لا تعني الحصانة من هجمات **اليوم صفر** أو أخطاء الإعداد المستقبلية —
   تُراجَع الترويسات والسياسات دورياً، ويُعاد فحص `pnpm audit` في كل إطلاق.

---

## 6) مرجع سريع

- `auth.ts`, `auth.config.ts` — Layer 1.
- `lib/security.ts` (`requireTenantId`, `getActorTenantId`), `lib/tenancy.ts` — Layer 2 (App).
- `lib/tenancy-db.ts` — Layer 2 (RLS utility جاهز).
- `prisma/migrations/20260913110000_enable_row_level_security/migration.sql` — RLS (ملف فقط).
- `lib/security-alerts.ts`, `lib/realtime.ts`, `lib/rate-limit.ts`,
  `app/api/pusher/auth/route.ts`, `app/(dashboard)/super-admin/alerts/page.tsx` — Layer 3.
- `next.config.mjs` — 10 ترويسات أمان.