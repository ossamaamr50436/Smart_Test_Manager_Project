# دليل النشر على Vercel

يشرح هذا الدليل خطوات رفع منصة **مدير الاختبارات الذكي الشامل** إلى بيئة الإنتاج على Vercel.

## 0) بنية النشر والتقنيات الحديثة

تم دمج تقنيات متقدمة مستفادة من موقع الجمعية في المنصة:

| التقنية | الاستخدام | موقع الملف |
|---|---|---|
| **Express.js** | خدمة دقيقة (Microservice) للمهام الخلفية الثقيلة ونقاط المراقبة والطابور | `server/index.js` |
| **Nginx** | خادم وسيط/موازن أحمال مع ضغط Gzip/Brotli وتخزين مؤقت وHTTPS | `deployment/nginx.conf` |
| **PWA** | دعم التثبيت والعمل دون اتصال عبر Manifest + Service Worker | `public/manifest.json`, `public/sw.js` |
| **LottieFiles** | رسوم متحركة خفيفة (شاشات تحميل، نجاح) | `components/ui/lottie-player.tsx` |
| **Lodash** | أدوات مساعدة للأمان والمرشحات في الـ Server Actions | `lib/actions/*` |
| **WhatsApp** | زر تواصل مع الدعم الفني (يُقرأ من `.env`) | `components/dashboard/dashboard-sidebar.tsx` |

## 1) المتطلبات

- حساب على [Vercel](https://vercel.com)، ويفضل ربطه بحساب GitHub.
- قاعدة بيانات **Neon PostgreSQL** (سحابية) بها كامل نموذج البيانات (راجع `prisma/schema.prisma`).
- حساب خدمة Google Cloud مفعّل عليه **Google Drive API** مع مجلد مخصص لرفع الملفات، وحصلنا على البريد الإلكتروني (`GOOGLE_CLIENT_EMAIL`) ومفتاح الخدمة الخاص (`GOOGLE_PRIVATE_KEY`).

## 2) تجهيز قاعدة البيانات والبيانات الأولية

```bash
# توليد عميل Prisma
pnpm prisma:generate

# دفع المخطط إلى قاعدة بيانات Neon (في أول نشر فقط)
pnpm prisma:push

# تهيئة الحساب الإداري الرسمي
pnpm db:seed
```

> السكريبت `prisma/seed.ts` ينشئ حساب **المسؤول العام** الرسمي فقط، ويحذف أي حسابات تجريبية لا تملك بيانات مرتبطة، ويُبقي الحسابات الحقيقية كما هي.

## 3) متغيرات البيئة في Vercel

من لوحة Vercel → `Settings → Environment Variables` أضف:

| المتغير | الوصف |
|---|---|
| `DATABASE_URL` | رابط اتصال Neon (يفضل نسخة Pooled من لوحة Neon) |
| `NEXTAUTH_SECRET` | مفتاح سرّي قوي (استخدم `openssl rand -base64 32` لإنشائه) |
| `NEXTAUTH_URL` | رابط الإنتاج النهائي، مثل `https://<project>.vercel.app` |
| `GOOGLE_CLIENT_EMAIL` | بريد حساب الخدمة |
| `GOOGLE_PRIVATE_KEY` | مفتاح حساب الخدمة (بما فيه `BEGIN/END PRIVATE KEY`) |
| `GOOGLE_DRIVE_FOLDER_ID` | معرّف مجلد Google Drive المخصص |

> ✅ لا ترفع `.env` أو `.env.production` إلى Git (مستثناة في `.gitignore`). يجب إضافة القيم الحقيقية في لوحة Vercel مباشرة.

## 4) إعدادات البناء (vercel.json)

الملف `vercel.json` المرفق يضبط:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["cdg1"]
}
```

- **framework**: `nextjs` — يتيح لـ Vercel معالجة Next.js تلقائياً.
- **regions**: نشره في منطقة `cdg1` (باريس) كأقرب منطقة للجمهور المستهدف.

## 5) ربط المشروع ونشره

1. ارفع الكود إلى GitHub (`git push origin main`).
2. في Vercel: `Add New Project → Import` من مستودع المشروع.
3. اختر **Root Directory** كجذر المشروع، وأكّد `pnpm` كمدير حزم.
4. أضف متغيرات البيئة من الخطوة (3) ثم **Deploy**.

بعد النشر الأول، تحدّث `NEXTAUTH_URL` في متغيرات البيئة على رابط الإنتاج النهائي وأعد النشر.

## 6) التحديث بعد البذر (Seed)

بعد أول نشر وتشغيل `prisma/seed.ts` على قاعدة الإنتاج، **احتفظ بالنسخة المطبوعة من بيانات الدخول** (البريد + كلمة المرور المؤقتة) في مكان آمن، وغيّر كلمة المرور المؤقتة بعد أول تسجيل دخول.

## 7) ملاحظات الإنتاج

- **Socket.IO**: مزامنة التقييم لحظياً تحتاج إلى خادم WebSocket دائم. في الإصدار الحالي يعمل الاتصال الآني من المتصفح للبث، لكن للاستخدام الشامل على نطاق واسع ننصح بتشغيل خادم Socket.IO منفصل (على Node خدمة مستقلة) وربطه بنفس مصدر البيانات.
- **خطوط الشهادات**: توجد ضمن المشروع في `assets/fonts` وتُبنى داخل التطبيق تلقائياً — لا حاجة لرفعها.
- **النسخ الاحتياطي**: فعّل Nightly Backup (أو Export) من لوحة Neon لحماية قاعدة البيانات.

## 8) فحص ما بعد النشر

- [ ] تسجيل الدخول بحساب المسؤول يعمل على `NEXTAUTH_URL` النهائي.
- [ ] توليد شهادة PDF ورفعها على Google Drive يعمل دون أخطاء (اختبر مسار إنشاء الشهادات).
- [ ] أدوار أعضاء المنصة تظهر بأسمائها العربية في الشريط الجانبي.

## 9) تشغيل خدمة Express المصغّرة (اختياري في الإنتاج)

الخدمة الدقيقة `server/index.js` تعمل على المنفذ `4000` (افتراضياً) وتقدّم نقاط المراقبة والطابور والمهام الخلفية الثقيلة.

```bash
# تشغيل الخدمة وحدها
pnpm server

# تشغيل Next.js + Express معاً أثناء التطوير
pnpm dev:all
```

نقاط النهاية المتاحة:

- `GET /health` — فحص حيوية الخدمة (يستخدمه Nginx/موازن الأحمال).
- `GET /api/queue/status` — حالة الطابور.
- `POST /api/queue/enqueue` — حجز مهمة ثقيلة في الطابور.

> في الإنتاج يمكن توجيه طلبات المراقبة عبر Nginx إلى الخدمة (راجع `deployment/nginx.conf` — مسار `/api/micro/` و `/api/queue/status`)، أو تشغيلها كخدمة مستقلة مع مدير عمليات (PM2/systemd). بالنسبة للمهام الثقيلة على نطاق واسع يُنصح بالانتقال إلى **BullMQ + Redis** بدلاً من الطابور الموجود في الذاكرة (توضيحي).

## 10) Nginx — خادم وسيط/موازن أحمال

يوفر `deployment/nginx.conf` تكويناً جاهزاً للبيئة الإنتاجية يتضمن:

- **موازنة الأحمال** بين نسخ متعددة من Next.js (عبر `upstream nextjs_app`).
- **تخزين مؤقت** للأصول الثابتة (`_next/static`, الأيقونات, `manifest.json`) مع `expires` طويل الأمد.
- **ضغط Gzip/Brotli** للاستجابات النصية والملفات الثابتة.
- **إعادة توجيه HTTPS** وفرض `HSTS` ورؤوس أمان (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- **توجيه طلبات الخدمة الدقيقة** (`/api/micro/`, `/api/queue/status`) إلى Express.

خطوات الاستخدام:

1. انسخ الملف إلى `/etc/nginx/sites-available/exam.conf` ثم أنشئ رابطاً رمزياً في `sites-enabled`.
2. عدّل `server_name` ومسارات الشهادات (`ssl_certificate`) ومسار الجذر (`/var/www/...`).
3. تأكد من أن تطبيق Next.js يستمع على `3000` وخدمة Express على `4000`.
4. افحص الصيغة: `nginx -t` ثم أعِد التحميل: `nginx -s reload`.

> ملاحظة: **CSP** يُدار ديناميكياً من التطبيق (مع nonce لكل طلب في Middleware) لذلك لا تُفرضه في Nginx حتى لا تتعارض القواعد. رأسا `HSTS` و `upgrade-insecure-requests` مضمّنان في التطبيق أيضاً.

## 11) PWA — تطبيق ويب تقدمي

المنصة تدعم التثبيت في المتصفح (سطح المكتب والجوال):

- `public/manifest.json` — اسم التطبيق، اللون `#015e63`، أيقونات 192 و512.
- `public/sw.js` — Service Worker يخزّن App Shell مؤقتاً ويدعم العمل دون اتصال.
- يُسجَّل الـ Service Worker تلقائياً عبر `ServiceWorkerRegister` في الإنتاج فقط.

للتفعيل: افتح الموقع على HTTPS وستظهر أيقونة "تثبيت التطبيق" في شريط العنوان. للتجربة المحلية، قم بالبناء ثم `pnpm start` (لأن التّسجيل يعمل في وضع production).