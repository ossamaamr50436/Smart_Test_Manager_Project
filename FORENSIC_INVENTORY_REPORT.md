# تقرير الجرد الجنائي الشامل (Forensic Inventory)

> **النطاق:** الجرد الكامل لمنصة «مدير الاختبارات الذكي الشامل» مقابل الوثيقة المرجعية الوحيدة `منصة_مدير_الاختبارات_SRS_V2.md` (الإصدار 2.0).
> **التاريخ:** سبتمبر 2026
> **المنهجية:** قراءة الوثيقة كاملة (535 سطراً)، وجرد كل ملف في `app/` و `components/` و `lib/` و `lib/actions/` و `prisma/`، وفحص كل دور واجهةً ومنطقاً، وتتبّع رحلة الطالب من الترشيح حتى الشهادة، ثم رصد كل فجوة بأولوية محددة.

---

## 1. الملخص التنفيذي

المنصة **في منتصف الطريق**: العمود الفقري (المخطط + المصادقة + عزل الصلاحيات + سجل التدقيق) مبني بجودة عالية، وجميع Server Actions الأساسية موجودة ومحميّة، لكن **سير العمل ينكسر عند الحلقات الحيوية الثلاث**:

1. **المزامنة الحية بين المعلمين أثناء التقييم معطّلة** (تعارض Socket.IO الميت مع بنية Pusher المكتملة).
2. **إنشاء حسابات المستخدمين غائب تماماً من قاعدة الكود** — لا توجد `user.create` في أي مكان، وهذا يعطّل مواصفة إنشاء حسابات المختبرين والأدوار كلها.
3. **التوقيع وإرسال الشهادات بلا أي واجهة** — الدوال الخلفية موجودة لكن لا زر واحد يستدعيها.

| الدور | الصفحة الرئيسية | الحالة |
|-------|----------------|--------|
| ADMIN | `/admin` | ⚠️ قالب «قيد التطوير» (الوظائف في `/admin/settings` و `/audit-log`) |
| HEAD_OF_AFFAIRS | `/head-of-affairs` | ✅ يعمل (اعتماد فقط؛ الرفض بلا واجهة) |
| CERTIFICATE_SOURCE | `/certificate-source` | ⚠️ الإصدار يعمل؛ التوقيع/الإرسال بلا واجهة |
| TEST_SPECIALIST | `/test-specialist` | ⚠️ الطلبات+اللجان+المراجعة تعمل؛ النماذج والحسابات مفقودة |
| EXAMINER | `/examiner` | ⚠️ يعمل لكن بلا بحث/فلترة، النموذج تلقائي، والمزامنة الحية معطّلة |
| INSTITUTION | `/institution` | ⚠️ قالب «قيد التطوير» (الترشيح فقط يعمل) |

---

## 2. جرد الملفات (Inventory)

### 2.1 صفحات التطبيق — `app/` (18 ملف TSX + 7 API routes)

| المسار | الدور | الحالة |
|--------|-------|--------|
| `app/(auth)/login/page.tsx` | عام | ✅ تسجيل دخول (NextAuth Credentials) |
| `app/(dashboard)/page.tsx` | عام (يعاد توجيهه) | ⚠️ إحصائيات **وهمية** (128 طالب، 54 جلسة…) |
| `app/(dashboard)/layout.tsx` | عام | ✅ سايدبار + Session/Settings Provider |
| `app/(dashboard)/admin/page.tsx` | ADMIN | ⚠️ `RolePlaceholder` |
| `app/(dashboard)/admin/settings/page.tsx` | ADMIN | ✅ إعدادات المنصة |
| `app/(dashboard)/audit-log/page.tsx` | ADMIN/SPECIALIST | ✅ سجل التدقيق |
| `app/(dashboard)/head-of-affairs/page.tsx` | HEAD_OF_AFFAIRS | ✅ قائمة الاعتماد |
| `app/(dashboard)/certificate-source/page.tsx` | CERTIFICATE_SOURCE | ✅ إصدار الشهادات |
| `app/(dashboard)/test-specialist/page.tsx` | TEST_SPECIALIST | ⚠️ `RolePlaceholder` |
| `app/(dashboard)/test-specialist/requests/page.tsx` | TEST_SPECIALIST | ✅ طلبات الترشيح |
| `app/(dashboard)/test-specialist/committees/page.tsx` | TEST_SPECIALIST | ✅ تشكيل اللجان |
| `app/(dashboard)/test-specialist/final-review/page.tsx` | TEST_SPECIALIST | ✅ مراجعة التقييمات |
| `app/(dashboard)/examiner/page.tsx` | EXAMINER | ✅ قائمة طلاب اللجان |
| `app/(dashboard)/examiner/assess/[studentId]/page.tsx` | EXAMINER | ✅ لوحة التقييم الحي |
| `app/(dashboard)/institution/page.tsx` | INSTITUTION | ⚠️ `RolePlaceholder` |
| `app/(dashboard)/institution/students/new/page.tsx` | INSTITUTION | ✅ نموذج الترشيح |
| `app/(dashboard)/notifications/page.tsx` | عام | ✅ الإشعارات |
| `app/api/auth/[...nextauth]/route.ts` | — | ✅ المصادقة |
| `app/api/pusher/auth/route.ts` | — | ✅ مصادقة قنوات Pusher |
| `app/api/import/models/route.ts` | SPECIALIST/ADMIN | ✅ استيراد النماذج (JSON خام — بلا واجهة) |
| `app/api/export/route.ts` | إدارية | ✅ تصدير طلاب CSV |
| `app/api/certificate/[id]/route.ts` | SOURCE/INSTITUTION/ADMIN | ✅ تنزيل الشهادة عبر وسيط (خصوصية Drive) |
| `app/api/settings/route.ts` + `logo` | عام | ✅ جلب الإعدادات العامة |

### 2.2 المكونات — `components/` (26 ملف)

- **مكتملة ومربوطة:** `auth/login-form`، `dashboard/dashboard-sidebar`، `admin/admin-settings-form`، `specialist/requests-table`، `specialist/committee-form`، `specialist/final-review-table`، `head-of-affairs/head-approval-table`، `certificate-source/certificate-table`، `students/nomination-form`، `examiner/assessment-board`، `audit-log/audit-log-table`، `notification/*`، `providers/*`.
- **`dashboard/role-placeholder.tsx`:** قالب «قيد التطوير» يُستخدم في 4 صفحات (admin، test-specialist، institution).

### 2.3 منطق الأعمال — `lib/actions/` (10 ملفات Server Actions)

| الملف | يخدم | الحالة |
|-------|------|--------|
| `auth-actions.ts` | عموم | ✅ login/logout/getCurrentUser/getStudentsForCurrentUser |
| `student-actions.ts` | INSTITUTION/SPECIALIST | ✅ ترشيح، مراجعة، تشكيل لجنة |
| `assessment-actions.ts` | EXAMINER | ✅ حفظ/اعتماد متسلسل حسب العمر |
| `admin-actions.ts` | SPECIALIST/HEAD | ✅ الاعتماد الإداري النهائي للمرّتين |
| `head-actions.ts` | HEAD | ✅ رفض رئيس الشؤون (**بلا واجهة**) |
| `certificate-actions.ts` | SOURCE/ADMIN/HEAD | ⚠️ إصدار ✅ — توقيع/قائمة توقيع **بلا واجهة** |
| `settings-actions.ts` | ADMIN | ✅ إعدادات المنصة (3 دوال) |
| `season-actions.ts` | SPECIALIST/ADMIN | ✅ مواسم (خلفية فقط — بلا واجهة) |
| `audit-actions.ts` | ADMIN/SPECIALIST | ✅ سجل التدقيق (فلاتر/إحصائيات) |
| `notification-actions.ts` | عموم | ✅ الإشعارات (قراءة/تحديد/مسح) |

### 2.4 بنى مساندة — `lib/`

- `security.ts` ✅ (requireUser/requireRole/خلاف — طبقة ممتازة)، `prisma.ts`، `roles.ts`، `score-config.ts`، `csp.ts`، `google-drive.ts` ✅ (رفع/تنزيل/نماذج/مجلدات)، `certificate-pdf.ts`، `certificate-template.ts`، `validations/*.ts`.
- ⚠️ **`lib/realtime.ts` (Pusher — خادم)**: `broadcastAssessmentUpdate` و `authenticateChannel` **لا يستدعيهما أي ملف في الإنتاج** (خادم علِق).
- ⚠️ **`lib/realtime-client.ts` (Pusher — متصفح)**: `subscribeToSession` **لا يستخدمه أي مكوّن**.
- ⚠️ **`lib/socket.ts` (Socket.IO — عميل)**: ما زال يُستخدم من `assessment-board.tsx` رغم فقدان الخادم.
- 🗑️ **`lib/validations/user.ts`**: `createUserSchema` — كود جاهز بلا أي مستدعٍ (مؤشّر على نية بناء إدارة المستخدمين).

### 2.5 مخطط قاعدة البيانات — `prisma/schema.prisma` (11 موديل + 7 Enums)

`User, Institution, Student, ExamSeason, ExamModel, ExamSession, Assessment, Certificate, Notification, AppSettings, AuditLog` — **يغطي الوثيقة بالكامل** (موسم، 100 نموذج، لجنة بمعلمَين بأعمار، سلسلة حالات متكاملة).

---

## 3. تحليل الأدوار الستة (دوراً بدور)

### 3.1 المسؤول (Admin) — الوثيقة §3.1

- **الصفحات المتوقعة:** لوحة تحكم كاملة العداد/تقارير، إدارة مستخدمين، إدارة جهات، عرض طلاب.
- **الصفحات الموجودة:** `/admin` (قالب قيد التطوير)، `/admin/settings` (إعدادات)، `/audit-log`، `/notifications`.
- **الوظائف المتوقعة:** عرض كل بيانات المستخدمين/الجهات/الطلاب، تعديل أي بيانات، إنشاء/حذف الحسابات وإدارة الصلاحيات، تقارير شاملة.
- **الوظائف الموجودة:** الإعدادات + سجل التدقيق + تصدير CSV للطلاب (`/api/export`) + تنزيل أي شهادة (`/api/certificate/[id]`).
- **الفجوات:** لوحة رئيسية، إدارة المستخدمين (⚠️ حرجة — لا `user.create/update/delete` في كامل المشروع)، قوائم الجهات/الطلاب، تقارير شاملة.
- **الأولوية:** حرجة.

### 3.2 رئيس الشؤون التعليمية — الوثيقة §3.2

- **الصفحات المتوقعة:** عرض جهات وطلاب ودرجات، اعتماد/رفض نهائي، إشعارات.
- **الصفحات الموجودة:** `/head-of-affairs` مع جدول اعتماد نهائي يعرض الجهة والفرع والدرجة.
- **الوظائف الموجودة:** `headOfAffairsFinalApprove` (اعتماد ✅) و `rejectStudentByHead` (رفض مع إعادة السلسلة + إشعارات + تدقيق — **مكتوب لكن بلا زر في الواجهة** ❌).
- **الفجوات:** زر/نموذج الرفض (سبب الرفض) غير موجود في `head-approval-table.tsx`.
- **الأولوية:** عالية.

### 3.3 مصدر الشهادات — الوثيقة §3.3 و §7.2

- **الصفحات المتوقعة:** استقبال بيانات الطالب، قالب الشهادة، توقيع المدير (يدوي/رقمي)، رفع الموقّعة، إرسال للجهة.
- **الصفحات الموجودة:** `/certificate-source` — جدول «بانتظار الإصدار» + جدول «الصادرات مؤخراً» مع روابط Drive.
- **الوظائف الموجودة:** `generateCertificate` ✅ (توليد PDF عبر قالب ذكي من Drive أو توليد مباشر، رفع على Drive، رقم تسلسلي فريد، إشعار الجهة، تدقيق). `signCertificate` ⚠️ (لـ ADMIN/HEAD — **بلا واجهة**). `getPendingCertificatesForSignature` ⚠️ (**نادراً ما يُعبَّأ**: الشهادات تُنشأ بحالة `UPLOADED` لا `PENDING`).
- **الفجوات:** عدد مرات **التوقيع** لا توجد شاشة/زر توقيع إطلاقاً؛ **خطوة «إرسال للجهة»** (الحالة `SENT`) غير موجودة في أي واجهة ولا في Server Actions؛ تحميل الجهة للشهادة يعمل عبر API لكن بلا زر في واجهة الجهة.
- **الأولوية:** عالية.

### 3.4 أخصائي الاختبارات (محور المنصة) — الوثيقة §3.4

- **الصفحات المتوقعة:** طلبات، نموذج 100 نموذج يدوي، حسابات المختبرين، لجان وتوزيع، مواعيد، اعتماد تقييمات.
- **الصفحات الموجودة:** `/requests` ✅، `/committees` ✅، `/final-review` ✅ + سجل التدقيق.
- **الوظائف الموجودة:** `reviewStudentApplication`، `assignCommittee` (تحقق من النماذج، تضارب المواعيد، موسم نشط، إشعارات)، `specialistFinalApprove`، استيراد النماذج عبر API.
- **الفجوات:**
  - ⚠️ **إنشاء حسابات المختبرين** مفقود (لا `user.create`) — الفجوة 2 الحرجة.
  - ⚠️ **واجهة إضافة النماذج الـ100 يدوياً** مفقودة (الاستيراد API خام فقط بلا حدود/تحقق من 1-100، والنموذج قد يُنشأ تلقائياً داخل التقييم).
  - ⚠️ **تعديل معايير التقييم** (§4.2) — الخصومات ثابتة في `lib/score-config.ts:1-4`.
- **الأولوية:** حرجة (حسابات) / عالية (نماذج ومعايير).

### 3.5 المختبر (المعلم) — الوثيقة §3.5

- **الصفحات المتوقعة:** قائمة طلاب لجنته، بحث وفلترة حسب التاريخ والفرع، فتح طالب واختيار رقم النموذج، تسجيل أخطاء/شك/تجويد، درجة تلقائية، اعتماد متسلسل حسب العمر.
- **الصفحات الموجودة:** `/examiner` (قائمة بلا بحث/فلترة) + `/examiner/assess/[studentId]`.
- **الوظائف الموجودة:** `saveAssessment` (حساب تلقائي، منع تكرار النموذج/الموسم، منع المقيّم من تعديل جلسة ليست لجنته)، `approveAssessment` (منطق الأكبر/الأصغر سناً من `birthDate`، منع تجاوز الترتيب، إشعارات).
- **الفجوات:**
  - ❌ **البحث والفلترة** حسب التاريخ والفرع (الوثيقة §3.5 بند 2) — غير موجود.
  - ⚠️ **اختيار رقم النموذج يدوياً** — مفقود؛ النموذج يُحلّ تلقائياً (`resolveModelId`).
  - ⚠️ **المقاطع** خيالية («المقطع الأول…الخامس») في `examiner/assess/[studentId]/page.tsx:54` — النماذج الحقيقية (سور/آيات/ترتيب) لا تُعرض.
  - ❌ **المزامنة الحية بين المعلمين** معطّلة (انظر §4).
- **الأولوية:** حرجة (مزامنة) / عالية (باقي).

### 3.6 الجهة التعليمية — الوثيقة §3.6

- **الصفحات المتوقعة:** تسجيل دخول بمعرّف/كلمة مرور، ترشيح الطلاب، رفع بيانات، عرض حالة الطلب، إشعارات، تحميل الشهادات.
- **الصفحات الموجودة:** `/institution/students/new` (ترشيح ✅)، `/institution` (قالب قيد التطوير ❌).
- **الوظائف الموجودة:** `createStudentApplication` + إشعار النتيجة (قبول/رفض/موعد/شهادة). تحميل الشهادة عبر `GET /api/certificate/[id]` (يسمح بالجهة) — لكن بلا واجهة.
- **الفجوات:**
  - ⚠️ **شاشة عرض الطلاب وحالة الطلب** غير موجودة واجهياً (القالب فقط) رغم جاهزية `getStudentsForCurrentUser` خلفياً.
  - ⚠️ **زر تحميل الشهادة الجاهزة** غير موجود في واجهة الجهة.
  - ⚠️ **رفع مستندات/بيانات إضافية** مع الترشيح (الوثيقة §3.6 «رفع البيانات المطلوبة») غير مدعومة في `studentApplicationSchema` ولا في النموذج.
- **الأولوية:** عالية (شاشة الحالة) / متوسطة (مستندات).

---

## 4. فحص سير العمل الكامل (رحلة الطالب)

| المرحلة (الوثيقة) | الواجهة | Server Action | انتقال الحالة | التقييم |
|------|---------|---------------|----------------|---------|
| 1. الترشيح | ✅ `NominationForm` | ✅ `createStudentApplication` | → `PENDING` | يعمل ✅ |
| 2. قبول/رفض الأخصائي | ✅ `requests-table` | ✅ `reviewStudentApplication` | → `APPROVED`/`REJECTED` | يعمل ✅ |
| 3. إنشاء المختبرين واللجان | ⚠️ `committee-form` (اللجان فقط) | ✅ `assignCommittee` | → `ASSIGNED` | **ينكسر**: لا يوجد إنشاء حسابات المعلمين 🔴 |
| 4. تحديد المواعيد | ✅ (داخل نموذج اللجنة) | ✅ `assignCommittee` | `SCHEDULED` | يعمل ✅ |
| 5. يوم الاختبار والتقييم | ⚠️ `assessment-board` | ✅ `saveAssessment` | `DRAFT` | يعمل جزئياً (نموذج تلقائي، مقاطع وهمية) ⚠️ |
| 6. الاعتماد المتسلسل بالعمر | ✅ (زر حسب الأكبر/الأصغر) | ✅ `approveAssessment` | `APPROVED`→`FINALIZED` ثم الطالب `COMPLETED` | **الترتيب صحيح**، لكن **الرؤية الحية بين المعلمين معطّلة** 🔴 |
| 7. الاعتمادات الإدارية | ✅ `final-review-table` (أخصائي) + `head-approval-table` (رئيس) | ✅ `specialistFinalApprove` ثم `headOfAffairsFinalApprove` | `NOTIFIED`→`READY_FOR_CERTIFICATE` | يعمل ✅ (رفض الرئيس بلا واجهة ⚠️) |
| 8. إصدار الشهادة | ⚠️ `certificate-table` | ✅ `generateCertificate` | `CERTIFICATE_ISSUED` | **ينكسر جزئياً**: بدون توقيع (`signCertificate`) وبدون «إرسال للجهة» (`SENT`) 🔴 |

**النقاط المكسورة في السلسلة:**
1. 🔴 **مرحلة 3/الجزء الخاص بالحسابات:** لا طريقة لإنشاء حساب معلم — يمنع إكمال المحاكاة الكاملة.
2. 🔴 **مرحلة 6/المزامنة:** المعلم الثاني لا يرى تعديلات الأول حياً.
3. 🔴 **مرحلة 8/التوقيع والإرسال:** لا توجد واجهة لتوقيع الشهادة أو إرسالها للجهة (الحالات `PENDING`/`SIGNED`/`SENT` موثّقة في المخطط لكن غير مستعملة في السير الفعلي — الشهادة تصل لـ `UPLOADED` ثم تبقى).

---

## 5. قائمة الفجوات الشاملة مرتّبة حسب الأولوية

### 🔴 حرجة (P1)
| # | الفجوة | الموقع | الأثر |
|---|--------|--------|-------|
| G1 | **لا إنشاء/تعديل/حذف لحسابات المستخدمين** إطلاقاً | لا يوجد `prisma.user.create/update/delete` في الإنتاج | يعطّل مواصفة §3.4 (حسابات المختبرين) و §3.1 (إدارة الحسابات) — لا يمكن تشغيل دورة كاملة |
| G2 | **المزامنة الحية معطّلة** — البورد يستخدم Socket.IO عميل بلا خادم، وبنية Pusher مكتملة غير موصولة | `assessment-board.tsx:5,81-135` يستدعي `@/lib/socket.ts`؛ `lib/realtime.ts` و `realtime-client.ts` و `broadcastAssessmentUpdate` بلا مستدعٍ | يخالف §4.3 «يرى البيانات حياً» و §9.1 «مزامنة < 500ms» — نقطة حرجة لنزاهة التقييم الثنائي |
| G3 | **التوقيع وإرسال الشهادة بلا واجهة** | `signCertificate` و `getPendingCertificatesForSignature` بلا أي مكوّن؛ لا إجراء `SENT` | يكسر المرحلة 8 (الشهادة تُرفع بلا توقيع مدير وبلا إرسال للجهة) |

### 🟠 عالية (P2)
| # | الفجوة | الموقع |
|---|--------|--------|
| G4 | لوحة المسؤول الرئيسية «قيد التطوير» بلا عداد/تقارير | `app/(dashboard)/admin/page.tsx` |
| G5 | إدارة الجهات/عرض الطلاب من منظور المسؤول مفقودة | — |
| G6 | شاشة الجهة التعليمية «قيد التطوير» (لا عرض حالة الطلبات ولا تحميل شهادة) | `app/(dashboard)/institution/page.tsx`؛ زر التحميل غائب |
| G7 | لا واجهة لإدارة المواسم رغم جاهزية `season-actions.ts` بالكامل | لا `.tsx` يستدعيها |
| G8 | لا واجهة لإنشاء النماذج الـ100 يدوياً (الاستيراد JSON فقط بلا تحقق رقابة 1-100) | `app/api/import/models/route.ts` |
| G9 | زر رفض رئيس الشؤون مفقود رغم جاهزية `rejectStudentByHead` | `head-approval-table.tsx` |
| G10 | المختبر بلا بحث/فلترة (تاريخ/فرع) | `app/(dashboard)/examiner/page.tsx` |
| G11 | الإحصائيات الوهمية في الصفحة الأم | `app/(dashboard)/page.tsx:17-22` |

### 🟡 متوسطة (P3)
| # | الفجوة |
|---|--------|
| G12 | معايير التقييم ثابتة في `score-config.ts` وغير قابلة للتعديل (§4.2) |
| G13 | اختيار رقم النموذج يدوياً من المختبر غير موجود (§4.3 «يدخل رقم النموذج»)؛ المقاطع وهمية في صفحة التقييم |
| G14 | `getStudentsForCurrentUser` كود خلفي جاهز بلا استخدام واجهي |
| G15 | `lib/validations/user.ts` (`createUserSchema`) جاهز بلا مستدعٍ — يُبنى فوقه إنشاء المستخدمين |
| G16 | الرفض الآلي للأخصائي يستخدم سبباً ثابتاً («عدم اكتمال البيانات») وليس سبباً حرّاً من المستخدم |

### 🔵 منخفضة / تنظيف (P4)
| # | الفجوة |
|---|--------|
| G17 | `socket.io` و `socket.io-client` ما زالت في `package.json:63-64` رغم أن سجل التغييرات يذكر حذفها — تعارض توثيقي وزومبي |
| G18 | `lib/socket.ts` يجب حذفه أو ربطه فعلياً بخادم |
| G19 | `server/index.js` (Express + BullMQ) خدمة جانبية غير موصولة بواجهة التطبيق |
| G20 | لا يوجد Rate Limiting (100 req/min كما نصّت §8.3) |

---

## 6. التوصيات — خطة عمل على مراحل

### المرحلة 1 — استعادة الاستمرارية (يغلق P1)
1. **إنشاء المستخدمين وإدارة الحسابات** (`lib/actions/user-actions.ts` جديد + صفحات): البناء فوق `lib/validations/user.ts` الجاهز، مع `requireRole(ADMIN / TEST_SPECIALIST)`، تشفير bcrypt، سجل تدقيق، وربط الجهة لـ INSTITUTION. (يغلق G1/G8/G15)
2. **توحيد المزامنة الحية على Pusher**:
   - توصيل `broadcastAssessmentUpdate` في `saveAssessment` و `approveAssessment`.
   - استبدال استدعاءات `@/lib/socket` في `assessment-board.tsx` بدالة `subscribeToSession` من `lib/realtime-client.ts`.
   - إزالة `lib/socket.ts` و حزم `socket.io*` من `package.json`. (يغلق G2/G17/G18)
3. **استكمال سير الشهادة**: شاشة «بانتظار التوقيع» (لـ ADMIN/HEAD) تستدعي `signCertificate`، ثم زر «إرسال للجهة» يحدّث الحالة إلى `SENT` مع إشعار. (يغلق G3)

### المرحلة 2 — اكتمال أدوار المسؤول والجهة والأخصائي (يغلق P2)
4. لوحة المسؤول بالعدادات والتقارير (من `getDashboardRedirectData` + إحصائيات التدقيق) + صفحات الجهات والطلاب. (G4/G5)
5. شاشة الجهة: قائمة طلابي + حالة الطلب + زر تحميل الشهادة الجاهزة (عبر `/api/certificate/[id]`). (G6)
6. واجهة المواسم فوق `season-actions.ts` الجاهزة. (G7)
7. زر الرفض مع سبب حر في `head-approval-table`. (G9/G16)
8. بحث/فلترة في لوحة المختبر. (G10/G11)

### المرحلة 3 — التخصيص والتحسين (يغلق P3/P4)
9. معايير تقييم قابلة للتعديل (§4.2). (G12)
10. اختيار رقم النموذج يدوياً وعرض التفاصيل الحقيقية (سور/آيات) من `detailsJSON` بدل المقاطع الوهمية. (G13)
11. ربط `getStudentsForCurrentUser` بواجهات جاهزة، ونظافة الحزم والخدمة الجانبية، وRate Limiting. (G14/G19/G20)

---

## 7. ملاحظات تقنية إضافية

- **أمان (إيجابي):** bcrypt، JWT بصلاحية 8 ساعات، `requireUser/requireRole` في كل Action، سجل تدقيق لكل تغيير، CSP صارمة (nonce) في الإنتاج، رفع الملفات حصراً إلى Google Drive (§3 حرفياً: `uploadFileToDrive` فقط ولا تخزين محلي).
- **الملفات والنماذج:** الالتزام «Neon للبيانات المهيكلة و Drive للملفات» مطبّق للشهادات والقالب؛ النماذج تُخزَّن `detailsJSON` في Neon مع إمكانية رفعه Drive (ملاحظة انحراف طفيف عن §7.1 القاطع، موثقة).
- **التعارض التوثيقي:** `CHANGELOG.md` يذكر نقل المزامنة إلى Pusher وحذف Socket.IO، بينما الكود الفعلي ما زال على Socket.IO في الواجهة — هذه الفجوة بين التوثيق والكود سببها قصة G2.
- **نقاط قوة كامنة:** `lib/security.ts` و `lib/validations/user.ts` و `lib/actions/season-actions.ts` و `head-actions.ts` و `certificate-actions.ts` — كلها جاهزة للربط المباشر بأي واجهة جديدة دون تعديل منطق.

---

**خلاصة:** البنية الخلفية تفوق الواجهات حالياً؛ فمعظم الدوال الحرجة موجودة ومحميّة الأهل، بينما تنقص الحلقات الوصلية (واجهات) الثلاث الكبرى: إدارة المستخدمين، المزامنة الحية الفعلية، وسير التوقيع/الإرسال. سدّها يحوّل المنصة من «تعمل على الورق» إلى دورة كاملة قابلة للتشغيل بموسم حقيقي.

**نهاية التقرير**