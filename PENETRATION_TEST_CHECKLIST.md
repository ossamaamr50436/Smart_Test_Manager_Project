# قائمة اختبار الاختراق (PENETRATION TEST CHECKLIST)

قائمة تحقق قابلة للتنفيذ لتقييم أمان **منصة مدير الاختبارات الذكي** قبل كل إطلاق.
طوّرت بالتزامن مع `SECURITY_ARCHITECTURE.md` (Phase C). تُستخدم يدوياً
أو عبر أدوات أتمتة، مع إعادة أي عنصر مفشل.

> **المبدأ:** لا يمكن تأكيد «اختراق صفري» — الهدف تقليل ناجح للهجمات عبر
> الطبقات الثلاث وتوثيق النتائج. راجع قسم Limitations في `SECURITY_ARCHITECTURE.md`.

---

## 1) المصادقة وإدارة الجلسة (Authentication & Session)

- [ ] جلسة العمل تنتهي بعد **8 ساعات** ولا تُمدَّد من غير نشاط (`maxAge/updateAge`).
- [ ] كوكنز الجلسة: `httpOnly` + `secure` (HTTPS) + `sameSite=lax` + `__Secure-` في الإنتاج.
- [ ] محاولات دخول فاشلة (5) خلال 15 دقيقة → **قفل الحساب 15 دقيقة** والفحص قبل مقارنة كلمة المرور.
- [ ] `Host`/`x-forwarded-host` غير المصرّح → رفض (Host Header Injection).
- [ ] تعديل `email` أو `password` أثناء الدخول لا يغيّر الهوية أو يتجاوز الفلترة.
- [ ] كلمة مرور فارغة/أقل من حد الطول مرفوضة (zod).
- [ ] `mustChangePassword` يُجبر على تغيير كلمة المرور قبل الاستخدام.

## 2) الصلاحيات وعزل المستأجرين (Authorization & Tenant Isolation)

- [ ] مستخدم `INSTITUTION` لا يرى ولا يعدّل بيانات جهة أخرى (كل الاستعلامات بفلتر `tenantId`).
- [ ] `assertSameTenant` مطبَّق على كل UPDATE/DELETE على سجل (وليس CREATE فقط).
- [ ] محاولة الوصول عبر معرّف Ten‌ant آخر → تُرفض **وتُسجَّل** كـ `CROSS_TENANT_ATTEMPT`.
- [ ] `SUPER_ADMIN` لديه وصول شامل مقصود؛ أي دور آخر لا يتجاوز بقيود `requireRole`.
- [ ] تصعيد الصلاحية (Role tampering) عبر تعديل الجلسة/الطلب → مرفوض.
- [ ] المعرفات الاختيارية (Optional chaining / `?studentId=`...) لا تكشف بيانات خارج النطاق.

## 3) حقن SQL / تسريب / بيانات حساسة (Injection & Data Exposure)

- [ ] لا يوجد استعلامات Prisma `$queryRaw`/`$executeRaw` مبنية بمدخلات مستخدم دون تهريب صارم.
- [ ] كلمات مرور مخزّنة **bcrypt** فقط — لا تُعاد أبداً في الاستجابات/السجلّات.
- [ ] أي استجابة JSON لا تتضمن حقولاً حساسة إضافية (`password`, `token`, `tenant secrets`).
- [ ] AuditLog لا يحوي بيانات حسّاسة غير لازمة (تفاصيل الدخول الفاشل باسم مستخدم فقط).
- [ ] محاولة حقن عبر `serialNumber`, `name`, `email` في البحث → لا تحدث نتائج خارجية.

## 4) التحقق من المدخلات / XSS / ReDoS (Input Validation)

- [ ] حقول النماذج تُتحقق بـ `zod` (zod input coercion) وليس بالثقة بالمتصفح.
- [ ] مدخلات معكوسة (RTL/Arabic) لا تكسر بنية HTML/JS (Sanitization عند إعادة العرض).
- [ ] `nonce` يُطبَّق على وسوم inline `<style>/<script>` (CSP) — لا `unsafe-inline` شاملة.
- [ ] ملفات المستخدم (PDF/صور / Google Drive) لا تتحول إلى XSS (استجابة `nosniff` + `Content-Disposition`).
- [ ] مدخلات مرتفعة الحجم لا تُسبِّب ReDoS (حدود الطول + تحقق صارم).

## 5) SSRF وتفاعلات خارجية (External services)

- [ ] جلب Google Drive عبر معرّف **من قاعدة الإعدادات (Safe list)** — لا URL مفتوح من المستخدم.
- [ ] تحميل الشهادات عبر الوسيط `/api/certificate/[id]` لا يتغيّر باستعمال `fileUrl` محرّف (فحص النطاق).
- [ ] مدخلات `x-forwarded-for` لا تُستخدم لاتخاذ قرار أمني وحيد (تُكوّن IP إحصائي فقط).
- [ ] Renders إشعارات Pusher: لا يُرسَل محتوى غير مُهرَّب عبر القنوات الخاصة.

## 6) معدّلات الحد / DoS (Rate Limiting)

- [ ] `checkMultiLevelRateLimit` مطبَّق على: IP (100/نافذة)، User (50/نافذة)، Tenant (500/نافذة).
- [ ] محاولات الدخول مقيدة (بريد 10/15د + IP 50/15د).
- [ ] تجاوز الحد → استجابة 429/رفض، وحدث `RATE_LIMIT_HIT` مسجَّل ومُنبَّه مرّة واحدة.
- [ ] استقرار Redis أو فقده لا يتسبب في إفساد رفض service (fail-open للقراءة أو وثّق).
- [ ] إغراق عبر إنشاء ملايين الـ Alert → مقنن عبر `checkRateLimit('alert:…', 1)`.

## 7) الترويسات والإعدادات (Headers & Config)

- [ ] `X-Frame-Options: DENY` (لا clickjacking).
- [ ] `X-Content-Type-Options: nosniff` + `Referrer-Policy` الصحيح.
- [ ] HSTS بقيمة مناسبة (إن كان HTTPS دائم).
- [ ] `Permissions-Policy` يقيّد الكاميرا/المايك/الجيولوجيشن لغير اللازم.
- [ ] `X-DNS-Prefetch-Control: off` + `X-Download-Options: noopen` + `X-Permitted-Cross-Domain-Policies: none`.
- [ ] CSP يسمح فقط بالنطاقات اللازمة (Google Fonts? الرسوم نفسية host).
- [ ] لا أسرار في `next.config.mjs`/`public/`. مفاتيح Pusher في متغيرات البيئة فقط.
- [ ] `trustHost: true` لا يسمح بقبضة Host غير مصرَّح (التحقق في L1 يغطيه).
- [ ] TLS صالح + توجيه HTTP→HTTPS.

## 8) السجلّات والمراقبة وسلسلة التوريد (Audit, Monitoring, Supply chain)

- [ ] دخول ناجح، دخول فاشل، قفل حساب، وحود عزل مشبوه → كلها في AuditLog.
- [ ] التنبيهات تصل لكل `SUPER_ADMIN` (Pusher + Notification) خلال ثوانٍ.
- [ ] قناة `private-super-admin-alerts` ترفض غير `SUPER_ADMIN`.
- [ ] `pnpm audit --audit-level=moderate` → **0 critical/0 high مباشر قابل للترقية**
  (بعد ترقية `next` 15.5.25). أي متبقٍ transitive/moderate **موثّق**.
- [ ] فحص دوري للاعتماديات في كل خط إطلاق (لا `pnpm install` أعمى لواحد حديث).
- [ ] `scripts/` (مثل `xlsx`) لا تدخل الحزمة الإنتاجية (تحقق عبر `next build` traces).
- [ ] لا push للمفاتيح أو ملفات `.env` — مراجعة `git log` لكل commit.

---

### ملاحظات تنفيذ
- كل بند يُسجَّل: ✅ ناجح / ❌ مفشل (وصف) / ⏸️ مؤجَّل (سبب).
- البنود المتعلقة بـ RLS تبقى ⏸️ طالما migration `enable_row_level_security` غير مطبَّق
  (راجع القرار في `SECURITY_ARCHITECTURE.md` §3).