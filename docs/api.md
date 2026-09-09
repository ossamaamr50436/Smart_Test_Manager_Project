# توثيق واجهات برمجة التطبيقات (API)

توثيق موجز لكامل واجهات النظام: نقاط HTTP + إجراءات الخادم (Server Actions) المستخدمة من الواجهات.

## قاعدة عامة

- كل النقاط تتطلب **مصادقة** عبر الدورة الجارية (NextAuth JWT Cookie).
- استجابات الخطأ تكون `{ "error": "...", "status": X }` دون كشف تفاصيل داخلية (OWASP).
- عزل الصلاحيات مطبق على كل نقطة (المادة 8) — الطلبات غير المصرح بها تعيد `403`.
- الترميز: `application/json` عموماً، والنصوص عربية RTL.

---

## 1) نقاط HTTP (Route Handlers)

### POST `/api/import/models` — استيراد نماذج الاختبار
- **الأدوار**: `TEST_SPECIALIST`, `ADMIN`
- **الجسم**: مصفوفة (بحد أقصى 200 عنصر):
  ```json
  [
    {
      "modelNumber": 1,
      "branch": "5",
      "institutionId": "inst_xxx",
      "seasonId": "season_xxx",
      "fileBuffer": "base64…؟أو يترك فارغاً",
      "fileName": "model-1.json",
      "details": { "segments": [...] }
    }
  ]
  ```
- **قيود التحقق**: `modelNumber` ∈ [1..20]، `branch` ∈ {5,10,15,20,25,30}، `seasonId` مطلوب.
- **الحماية**: Rate limit (5/15د)، حجم ملف ≤ 2MB، الرفع اختياري إلى Google Drive.
- **الاستجابة**: `{ "imported": n, "failed": m, "results": [{modelNumber, ok, error?}] }`
- **الخطأ العام**: `403` (غير مصرح) — لا يُكشف سبب أمني.

### GET `/api/certificate/[id]` — تنزيل شهادة PDF عبر وسيط
- **الأدوار**: `CERTIFICATE_SOURCE` (أي شهادة) • `INSTITUTION` (شهادات الجهة فقط) • `ADMIN`.
- **الحماية**: تحقق من الحالة (`PENDING` → 404)؛ قائمة بيضاء للمحتوى؛ `X-Content-Type-Options: nosniff`؛ رؤوس `Cache-Control: private, no-store`.
- **الاستجابة**: تيار ثنائي للـ PDF مع `Content-Disposition` بملف مسمّى برقم الشهادة واسم الطالب.
- **ملاحظة**: المتصفح لا يرى معرّف Drive إطلاقاً (خصوصية المادة 8/5).

### GET/PUT `/api/settings` — إعدادات المنصة (الاسم، الشعار، الإعلان)
- **الأدوار**: GET للجميع المسجلين (قراءة عامة داخل النظام) • PUT `ADMIN` فقط.
- **الاستجابة**: `{ platformName, logoUrl, announcement }`.

### POST `/api/settings/logo` — رفع الشعار
- **الأدوار**: `ADMIN`.
- **التفاصيل**: رفع صورة (تحقق من نوع الملف والحجم) — يُخزَّن على Google Drive ويُعاد الرابط.

### POST `/api/pusher/auth` — تخويل قناة المزامنة اللحظية
- **الأدوار**: أي مستخدم مسجل.
- **الغرض**: مصادقة قنوات Pusher الخاصة (channel private/existence) لقنوات التقييم.

### GET `/api/export` — تصدير البيانات (CSV بأمان)
- **الأدوار**: `ADMIN`, `TEST_SPECIALIST` (حسب المورد).
- **الحماية**: تحييد **Formula Injection** في كل الحقول النصية حتى لا يُنفَّذ Excel الصيغ الضارة.

### POST `/api/auth/[...nextauth]` — إدارة الجلسات (NextAuth v5)
- Credentials (بريد + كلمة مرور مجزأة بـ bcrypt).

---

## 2) إجراءات الخادم (Server Actions)

تُستدعى من مكونات الواجهة المبنية على RSC/Client. كلها تتحقق من المصادقة والصلاحية داخلياً.

### إدارة النماذج — `lib/actions/model-actions.ts`
| الإجراء | الأدوار | الوصف |
|---|---|---|
| `createExamModel(input)` | SPECIALIST, ADMIN | إنشاء نموذج (10 مقاطع × 7 حقول) مع منع التكرار `[الجهة، رقم، موسم، فرع]` والتدقيق في معاملة واحدة. |
| `updateExamModel(id, input)` | SPECIALIST, ADMIN | تعديل نموذج مع التحقق من تسلسل المقاطع 1-10. |
| `deleteExamModel(id)` | SPECIALIST, ADMIN | حذف نموذج **غير مستخدم** فقط (المستخدم يمنع). |

### إدارة التقييم — `lib/actions/assessment-actions.ts`
| الإجراء | الأدوار | الوصف |
|---|---|---|
| `saveAssessment(input)` | EXAMINER | حفظ/تحديث مسودة تقييم بحساب الدرجات وفق اللائحة (100) + سجل تدقيق في معاملة؛ يمنع تعديل المعتمَد. |
| `approveAssessment(sessionId, action)` | EXAMINER | الاعتماد المتسلسل بالأقدمية (approve/finalize) + تحديث حالة الطالب والإشعارات في معاملة. |
| `getAssessmentState(sessionId)` | EXAMINER (لجنته) أو ADMIN/SPECIALIST | قراءة بيانات التقييم الحالية. |

> **حقل المعرفة**: كل إجراءات التقييم تُكمل الحفظ/الاعتماد عبر `prisma.$transaction` لضمان الذرية (لا حالة وسطى ناقصة).

### الباقي (نفس النمط)
- `lib/actions/auth-actions.ts` — المصادقة (تسجيل الدخول/الخروج/الحصول على المستخدم الجاري).
- `lib/actions/season-actions.ts` — `getCurrentSeason()`: الموسم النشط (مخزّن مؤقتاً 5 دقائق).
- `lib/actions/committee-actions.ts` (حسب مسار العمل) — تشكيل اللجان وتوزيع الطلاب على المعلمين.

### الإشعارات متعددة القنوات — `lib/notifications.ts`
| الدالة | الوصف |
|---|---|
| `notifyOne(payload)` | إشعار لمستخدم واحد عبر كل القنوات (داخلي + دفع + بريد + SMS). |
| `notifyMany(userIds, payload)` | إشعار جماعي (بذر الداخلية + دفع لكل مستخدم + بريد/SMS جمعي). |
| `dispatchNotificationChannels({userIds,...})` | توزيع القنوات الخارجية فقط — يُستدعى بعد المعاملات الذرية لتجنب تكرار السجلات. |

- **قناة الدفع اللحظي**: قناة `private-user-{id}` عبر Pusher (الحدث `notification:new`) — تصادقها واجهة `/api/pusher/auth`.
- **بريد/SMS**: عبر `EMAIL_WEBHOOK_URL`/`RESEND_API_KEY` و`SMS_WEBHOOK_URL` (اختيارية؛ دونها يعمل النطاق التطبيقي دائماً).
- **المرونة**: أي فشل في قناة خارجية لا يُسقط الإشعار الداخلي (Graceful Degradation).

---

## 3) أمثلة طلبات/استجابات

### استيراد نموذج (نجاح جزئي)
```http
POST /api/import/models
Authorization: Bearer ⚠️ (فعلياً جلسة NextAuth عبر Cookie)
Content-Type: application/json

[
  { "modelNumber": 3, "branch": "10", "institutionId": "inst_a", "seasonId": "s1" }
]
```
```json
202
{ "imported": 1, "failed": 0, "results": [{ "modelNumber": 3, "ok": true }] }
```

### خطأ صلاحية موحّد
```json
403
{ "error": "غير مصرح" }
```

---

## 4) مخطط الدرجات (لائحة الخاتمين)

| المكوّن | الحد الأقصى | الخصم |
|---|---|---|
| الحفظ | 70 | خطأ كلمة 1 • خطأ حرف 1 • خطأ ضبط 1 • لحن جلّي 2 • لحن خفي 0.5 • تنبيه 1 • شك 0.5 |
| التلاوة | 20 | — |
| التجويد | 10 | — |
| **الإجمالي** | **100** | درجة الاجتياز: **80** |

الدرجة لا تقل عن صفر ولا تتجاوز 100 (مضمون في `lib/score-calculation.ts`).