# سجل التغييرات — منصة الاختبارات

> كل تغيير في هذه الجولة موثّق هنا مع السبب والأثر
> (التوثيق مطلوب من متطلبات الجولة النهائية).

## جولة الهوية والتقنيات الحديثة (2026-09-06)

> دمج التقنيات المستفادة من موقع الجمعية وتوحيد الهوية البصرية باللونين `#015e63` و `#d3bb8b`.

### 1) الهوية البصرية — اللونان الأساسيان
- **السبب:** توحيد كل الواجهات على الهوية الجديدة؛ اللون الأساسي `#015e63` (أزرق مخضر غامق) والثانوي `#d3bb8b` (ذهبي بيج).
- **الحالة:** `tailwind.config.ts` والواجهات الرئيسية (صفحة الدخول، الشريط الجانبي، تخطيط لوحة التحكم) كانت مستخدمة بالفعل للّونين — أُضيف:
  - `theme-color: #015e63` عبر `viewport` في `app/layout.tsx`.
  - روابط ووسوم PWA في `app/layout.tsx` (Manifest، أيقونة آبل، اسم التطبيق).
- **تم التحقق:** لا توجد أي بقايا من الألوان القديمة `#00A896` و `#8B4789` في الكود.

### 2) خادم Express المصغّر (الخدمة الدقيقة)
- `server/index.js` (جديد): خدمة Express موازية تقدم نقاط `/health` (مراقبة)، `/api/queue/status` (حالة الطابور)، `/api/queue/enqueue` (حجز مهمة ثقيلة).
- `package.json`: سكربت `server` لتشغيل الخدمة و `dev:all` لتشغيلها مع Next.js (عبر `concurrently`).
- مثبّتة: `express@5.2.1`, `cors@2.8.6`, `concurrently@10.0.5`.
- **التحقق:** استجابت النقاط الثلاث بنجاح محلياً (`/health` → ok، `/api/queue/status`، `/api/queue/enqueue`).

### 3) Nginx — خادم وسيط/موازن أحمال
- `deployment/nginx.conf` (جديد): توزيع الطلبات بين نسخ Next.js، تخزين مؤقت للأصول الثابتة، ضغط Gzip/Brotli، إعادة توجيه HTTPS ورؤوس أمان (HSTS وغيرها)، وتوجيه طلبات الخدمة الدقيقة إلى Express.
- `docs/deployment-guide.md`: أُضيفت أقسام البنية الجديدة (فهرس التقنيات، تشغيل Express، استخدام Nginx، تفعيل PWA).

### 4) دعم PWA (تطبيق ويب تقدمي)
- `public/manifest.json` (جديد): اسم/وصف التطبيق، `theme_color: #015e63`، `dir: rtl`، أيقونات 192 و512.
- `public/icons/icon-192x192.png` و `icon-512x512.png` (جديدتان مولّدتان من شعار المنصة).
- `public/sw.js` (جديد): Service Worker — App Shell precache منفصل، Cache First للملفات الثابتة، Network First للتنقّل، مسح المخازن القديمة.
- `components/providers/service-worker-register.tsx` (جديد): تسجيل الـ Service Worker في بيئة الإنتاج فقط.
- `app/layout.tsx`: روابط الـ Manifest و `apple-touch-icon` ووسوم `mobile-web-app-capable`.
- **التحقق في وضع الإنتاج:** `manifest.json` و `sw.js` والأيقونات و `lottie/loading.json` تستجيب بـ 200.

### 5) LottieFiles — رسوم متحركة خفيفة
- مثبّتة: `lottie-react@3.1.1`.
- `components/ui/lottie-player.tsx` (جديد): مكوّن قابل لإعادة الاستخدام (يدعم `src` من رابط أو كائن مضمّن).
- `public/lottie/loading.json` و `success.json` (جديدتان): رسوم محلية خفيفة (تحميل + نجاح).
- `components/auth/login-form.tsx`: عرض حركة التحميل أثناء تسجيل الدخول.

### 6) Lodash — أدوات مساعدة آمنة
- مثبّتة: `lodash@4.18.1` و `@types/lodash@4.17.25`.
- `lib/actions/student-actions.ts`: استخدام `uniq()` بدل `[...new Set()]` و `size()` للتحقق من وجود المستلمين.

### 7) WhatsApp Business Chat
- `.env.example`: إضافة `NEXT_PUBLIC_WHATSAPP_NUMBER` (رقم الدعم الفني بصيغة دولية).
- `components/dashboard/dashboard-sidebar.tsx`: زر "تواصل مع الدعم الفني" يفتح `https://wa.me/<الرقم>` (يظهر فقط عند ضبط المتغير).

### 8) مصالحة حالة المستودع (إصلاح أخطاء مسبقة عطلت البناء)
- **السبب:** المستودع كان في حالة وسيطة (CHANGELOG يصف إنجاز Pusher لكن الحزم غير مثبتة، ومسار الشهادات يشير لحقول/دوال غير موجودة) مما يمنع `typecheck` و `build`.
- مثبّتتا `pusher@5.3.4` و `pusher-js@8.6.0` (مطلوبتان من `lib/realtime.ts` و `lib/realtime-client.ts` ونقطة `api/pusher/auth`).
- `lib/google-drive.ts`:
  - حذف صلاحية "anyone/reader" من `uploadFileToDrive` و `uploadExamModelFile` نهائياً (خصخصة الملفات — المادة 3).
  - إضافة `extractDriveFileId` (استخراج المعرّف من أي صيغة رابط) و `getDriveFileMimeType` (جلب نوع MIME).
- `app/api/certificate/[id]/route.ts`: استبدال الحقل غير الموجود `fileId` باستخراج المعرّف من `fileUrl` عبر `extractDriveFileId` — الوسيط الآمن يعمل على المخطط الحالي.

### التحقق النهائي (الجولة كاملة)
- `pnpm install` ✅
- `npx prisma generate` ✅
- `npx prisma migrate deploy` ✅ (لا ترحيلات معلّقة)
- `pnpm build` ✅ (24 مساراً)
- `pnpm lint` ✅ (لا تحذيرات)
- `pnpm typecheck` ✅
- خادم Express يعمل ويستجيب لنقاطه ✅
- أصول PWA تُقدَّم بشكل صحيح في وضع الإنتاج ✅

---

## الجولة النهائية — إغلاق الثغرات الأمنية الحرجة (2026-09-05)

### 1) المزامنة الحية عبر Pusher بدلاً من Socket.IO
- **السبب:** محرك Socket.IO (client-only سابقاً صيغة `lib/socket.ts`) لا يعمل على Vercel Serverless لأن الاتصالات WebSocket الطويلة غير مدعومة، وعدم وجود خادم Socket.IO يجعل البث بلا مصادقة حقيقية لكل اتصال.
- **القرار:** اعتماد **المسار (أ)** من المهمة الأولى: خدمة خارجية **Pusher Channels** (قنوات خاصة `private-assessment-*`) — الأكثر استقراراً وإحكاماً مع Serverless.
- **التغييرات:**
  - `lib/realtime.ts` (جديد): عميل الخادم (Singleton) + `authenticateChannel()` — يرفض الاشتراك في جلسة ليست ضمن لجنة المستخدم (عزل الجلسات/المادة 8/2) + `broadcastAssessmentUpdate()`.
  - `app/api/pusher/auth/route.ts` (جديد): نقطة مصادقة الاشتراك في القنوات الخاصة — تتحقق من الجلسة وعضوية اللجنة قبل التوقيع.
  - `lib/realtime-client.ts` (جديد): عميل المتصفح (pusher-js) — مفتاح عام فقط، إعادة اتصال تلقائية، تعطيل تلقائي عند غياب الإعدادات.
  - `lib/actions/assessment-actions.ts`: استُبدل البث عبر socket بـ `broadcastAssessmentUpdate` عند الحفظ والاعتماد + دالة `broadcastAssessmentPatch` للوحات الحية. إهمال فشل البث لا يمنع الحفظ (قاعدة البيانات تبقى مصدر الحقيقة الأخير — محقق لشرط "حفظ الحالة في قاعدة البيانات").
  - `components/examiner/assessment-board.tsx`: استخدام `subscribeToSession` بدل socket؛ حماية `locked` عند وصول حالة غير DRAFT.
  - حُذف `lib/socket.ts` وحزمتا `socket.io` و `socket.io-client` ونُصبت `pusher` و `pusher-js`.
- **الأثر:** بث لحظي مصادق عليه لكل اتصال، عزل تام بين الجلسات، عمل موثوق على Vercel، وبدون أي مفاتيح سرية في المتصفح.
- **الإعداد:** مفاتيح `PUSHER_APP_ID`, `NEXT_PUBLIC_PUSHER_KEY`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_CLUSTER` (اختيارية محلياً — مطلوبة في الإنتاج). الموثقة في `.env.example`.

### 2) خصوصية Google Drive (إزالة صلاحية "anyone")
- **السبب:** كانت `uploadFileToDrive` و `uploadExamModelFile` تمنحان `type: "anyone", role: "reader"` — يجعل الشهادات والنماذج متاحة لأي شخص يملك الرابط.
- **التغييرات:**
  - `lib/google-drive.ts`: حُذفت كل صلاحيات "anyone" نهائياً من دالتي الرفع — الملفات خاصة تماماً (وصول عبر حساب الخدمة فقط).
  - `app/api/certificate/[id]/route.ts` (جديد): وسيط تنزيل آمن — تحقق من الدور وإذا كان `INSTITUTION` يسمح فقط بطلاب جهتِه (المادة 8/7)، ثم يبث PDF من Drive عبر `alt: "media"` مع `Content-Disposition: attachment` و `no-store`.
  - `lib/actions/certificate-actions.ts`: تخزين `fileId` (وليس الرابط العام) عند الإصدار والتوقيع؛ `getCertificateDriveLink` يرجع مسار `/api/certificate/{id}` بدل رابط Drive.
  - `components/certificate-source/certificate-table.tsx` و`app/(dashboard)/certificate-source/page.tsx`: زر التحميل يستخدم المسار الآمن.
  - `app/api/settings/logo/route.ts` (جديد): الشعار خاص أيضاً ويُقدَّم عبر الخادم (لا "anyone")، و`settings-actions` يجعل `logoUrl = "/api/settings/logo"` — صيغة webViewLink القديمة تُستبدل تدريجياً.
- **الأثر:** لا يمكن فتح أي شهادة أو نموذج أو توقيع بواسطة الرابط المباشر؛ كل الوصول يمر عبر خادمنا مع عزل صلاحيات صارم.

### 3) سياسة أمان المحتوى (CSP) — إزالة unsafe-inline / unsafe-eval
- **السبب:** السماح بـ 'unsafe-inline' و 'unsafe-eval' في script-src يفتح الباب لتنفيذ سكربتات محقونة (XSS).
- **التغييرات:**
  - `middleware.ts`: تمديد الحارس (NextAuth) ليتولّد لكل طلب nonce عشوائي (crypto.randomUUID) ويضبط رأس `Content-Security-Policy` ديناميكياً، مع تمرير nonce كرأس طلب `x-nonce`. لا يستدعي قاعدة البيانات (متوافق مع Edge).
  - `lib/csp.ts` (جديد): باني CSP — `script-src 'self' 'nonce-…'` (بدون unsafe-inline/unsafe-eval)، و connect-src يتضمن أصول Pusher، مع السماح الصريح بصور/خطوط Drive و Google Fonts.
  - `next.config.mjs`: أُزيل الرأس الثابت لـ CSP (لا يمكن تضمين nonce في رأس ثابت) مع الإبقاء على بقية رؤوس الأمان الثابتة.
  - `app/layout.tsx`: قراءة nonce من `headers()` وتطبيقه على الـ head.
- **الأثر:** تحققت يدوياً من مطابقة nonce لجميع السكربتات الداخلية (16/16) في بيئة الإنتاج المحلية — CSP مشدد يعمل بدون كسر Next.js.

### 4) تشديد مخطط قاعدة البيانات (Prisma) + الترحيلة
- **السبب:** `seasonId` و `birthDate` كانت اختيارية رغم تبعية القواعد التجارية عليها؛ والقيد `@@unique([examSessionId, modelId])` كان يمنع المعلّمَين من استخدام نفس النموذج في اللجنة نفسها.
- **التغييرات في `prisma/schema.prisma`:**
  - `User.birthDate` أصبحت إجبارية (يعتمد الترتيب العمري على تواريخ الميلاد — المادة 5).
  - `ExamModel.seasonId` أصبحت إجبارية (المادة 6).
  - `ExamSession.seasonId` أصبحت إجبارية + أُضيف `modelId` على مستوى الجلسة مع قيد فريد **`@@unique([seasonId, modelId])`** يمنع إعادة استخدام نفس النموذج لطالب آخر في نفس الموسم على مستوى قاعدة البيانات (يحل محل القيد القديم).
  - `Assessment`: استُبدل `@@unique([examSessionId, modelId])` بـ **`@@unique([examSessionId, evaluatorId])`** — تقييم واحد لكل مقيّم، مع شارك اللجنة نفس النموذج عبر `examSession.modelId`.
  - `Certificate.serialNumber`: `@unique @default(cuid())` — مضمون على مستوى DB مع استمرار توليد الصيغة القرائية CERT-YYYY-NNNN في التطبيق.
  - أُضيف `Certificate.fileId` و `Certificate.signatureFileId` لمسار التحميل الآمن.
- **التغييرات البرمجية المرافقة:** `resolveModelId` يعيد استخدام نموذج الجلسة أو يسند أول نموذج غير مستخدم ثم يثبّته على الجلسة (مع حماية السباق)؛ `student-actions` يرفض التوزيع بلا موسم نشط؛ واجهة import/models تتطلب `seasonId`.
- **الترحيلة:** ملف جديد `prisma/migrations/20260905094522_harden_schema/migration.sql` (مولّد يظهر الفرق الفعلي بين قاعدة البيانات الحية والمخطط الجديد) ثم `prisma migrate deploy` ضد Neon بنجاح.
- **الأثر:** ضمانات نزاهة البيانات على مستوى قاعدة البيانات لا التطبيق فقط.

### 5) متفرقات الأمان والامتثال
- **5.1 كلمة مرور الأدمن:** `prisma/seed.ts` لم تعد تحتوي على أي كلمة مرور مكتوبة — تُقرأ من متغير البيئة `ADMIN_PASSWORD` (يُرفض البذر إن لم تكن ≥8 أحرف)؛ أُضيفت إلى `.env.example`؛ يُنصح بتغيير كلمة المرور بعد أول دخول. **تنبيه:** إن كان المستودع عاماً، يجب تنظيف تاريخ Git من كلمة المرور القديمة (git filter-repo/BFG) لتطهيرها نهائياً.
- **5.2 الأنواع:** `types/next-auth.d.ts` — `role: Role` (من `@prisma/client`) بدل `string`.
- **5.3 مدير الحزم:** حُذف `package-lock.json` وأُضيف إلى `.gitignore` (نعتمد pnpm فقط).
- **5.4 الاعتماديات:** `dotenv` مثبّتة على `^16.4.5` (توافق أكبر مع بيئة Node الحالية).
- **الاعتماديات الجديدة:** `pusher` `^5.3.4` و `pusher-js` `^8.6.0`؛ حُذفت `socket.io` و `socket.io-client`.

### التحقق النهائي
- `pnpm typecheck` ✅ `pnpm lint` ✅ `pnpm build` ✅ (24 صفحة/مسار — يشمل /api/certificate/[id] و /api/pusher/auth و /api/settings/logo)
- التحقق اليدوي في بيئة الإنتاج المحلية:
  - CSP بِـ nonce مطابق لكل السكربتات الداخلية (16/16) ✅
  - `/api/certificate/*` بدون مصادقة → 403 ✅
  - `/api/pusher/auth` بدون مصادقة → 403 ✅
  - `/api/settings/logo` → 404 (لا شعار بعد) ✅