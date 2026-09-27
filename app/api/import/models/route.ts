import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-guard";
import { requireRole, requireTenantId } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, Prisma } from "@prisma/client";
import { uploadFile } from "@/lib/file-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { importQuestionBankSchema } from "@/lib/validations/question-bank";
import type { ExamSegmentInput } from "@/lib/validations/assessment";

/**
 * استيراد النماذج الاختبارية من ملف JSON إلى بنك الأسئلة (المهمة I)
 * عزل الصلاحيات: أخصائي الاختبارات فقط (المادة 8).
 *
 * يرفع ملف النموذج على وحدة التخزين (UploadThing) ويسجّل بياناته
 * في قاعدة البيانات (بنك الأسئلة — بلا موسم أو جهة).
 *
 * تنسيق JSON المتوقع (مطابق لـ`importQuestionBankSchema` — المصدر الوحيد للحقيقة):
 * [
 *   {
 *     "modelNumber": 1,
 *     "branch": "5",
 *     "segmentsCount": 5,
 *     "details": { "segments": [ { "number": 1, "fromText": "…", … } ] }
 *   }
 * ]
 *
 * قواعد التحقق (كلها على الخادم — لا يُقبل أي عنصر غير مطابق):
 * - `importQuestionBankSchema` (= questionBankSchema + حد أدنى 5 مقاطع):
 *   رقم النموذج 1..100، فرع معروف، 5..10 مقاطع، وبنية كل مقطع كاملة
 *   (نص/سورة/آية) برقم 1..30.
 * - تطابق `segmentsCount` مع العدد الفعلي للمقاطع.
 * - ترقيم المقاطع تسلسلياً 1..N.
 * - أي عنصر فاشل لا يُرفع ملفه ولا يُكتب في قاعدة البيانات إطلاقاً.
 */

/** غلاف الاستيراد: أيقظة الحقول دون الوثوق بأي قيمة قبل التحقق */
const importItemEnvelope = z
  .object({
    modelNumber: z.unknown().optional(),
    branch: z.unknown().optional(),
    segmentsCount: z.unknown().optional(),
    details: z.unknown().optional(),
    segments: z.unknown().optional(),
    fileBuffer: z.string().optional(),
    fileName: z.string().optional(),
  })
  .passthrough();

/** بنية المقاطع: مصفوفة واحدة على الأقل، عناصرها يُتحقق منها عبر examSegmentSchema */
const segmentsEnvelope = z.object({
  segments: z.array(z.unknown()).min(1),
});

/** رقم النموذج للعرض في النتائج (لا يُستخدم كقيمة كتابة) */
function toReportedModelNumber(value: unknown): number {
  const n =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

/** الفرع كنص (يقبل الرقم 5 أو النص "5") — والتحقق النهائي داخل z.enum */
function toBranchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "5";
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

    // منع إساءة الاستخدام: حد أقصى 5 عمليات استيراد لكل مستخدم خلال 15 دقيقة
    await checkRateLimit(`import-models:${user.id}`, 5);

    const body: unknown = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: "البيانات يجب أن تكون مصفوفة من النماذج" },
        { status: 400 }
      );
    }
    if (body.length > 200) {
      return NextResponse.json(
        { error: "عدد النماذج يتجاوز الحد الأقصى (200)" },
        { status: 400 }
      );
    }

    const results: { modelNumber: number; ok: boolean; error?: string }[] = [];
    const modelsToCreate: Prisma.QuestionBankModelCreateManyInput[] = [];
    const tenantId = requireTenantId(user);

    for (const raw of body) {
      const envelope = importItemEnvelope.safeParse(raw);
      if (!envelope.success) {
        results.push({
          modelNumber: 0,
          ok: false,
          error: "بنية عنصر الاستيراد غير صحيحة (يجب أن يكون كائن JSON)",
        });
        continue;
      }
      const item = envelope.data;
      const reportedNumber = toReportedModelNumber(item.modelNumber);

      // استخراج المقاطع: إمّا داخل `details.segments` أو في `segments` مباشرة
      const fromDetails = segmentsEnvelope.safeParse(item.details);
      const fromTopLevel = segmentsEnvelope.safeParse({ segments: item.segments });
      const rawSegments = fromDetails.success
        ? fromDetails.data.segments
        : fromTopLevel.success
          ? fromTopLevel.data.segments
          : null;

      if (!rawSegments) {
        results.push({
          modelNumber: reportedNumber,
          ok: false,
          error: "بنية المقاطع غير صحيحة — يجب إرسال details.segments كمصفوفة",
        });
        continue;
      }

      // المصدر الوحيد للحقيقة: نفس مخطط مسار الإنشاء الرسمي
      // + حد أدنى 5 مقاطع للاستيراد (importQuestionBankSchema)
      const parsed = importQuestionBankSchema.safeParse({
        modelNumber: item.modelNumber,
        branch: toBranchValue(item.branch),
        segmentsCount: item.segmentsCount,
        segments: rawSegments,
      });

      if (!parsed.success) {
        results.push({
          modelNumber: reportedNumber,
          ok: false,
          error: parsed.error.issues[0]?.message ?? "بيانات النموذج غير صحيحة",
        });
        continue;
      }

      const data = parsed.data;
      const segments: ExamSegmentInput[] = [...data.segments].sort(
        (a, b) => a.number - b.number
      );

      // تطابق العدد المعلن مع العدد الفعلي
      if (segments.length !== data.segmentsCount) {
        results.push({
          modelNumber: data.modelNumber,
          ok: false,
          error: `عدد المقاطع المحدد (${data.segmentsCount}) لا يطابق المقاطع المُدخلة (${segments.length})`,
        });
        continue;
      }

      // ترقيم تسلسلي 1..N
      const badIndex = segments.findIndex((seg, idx) => seg.number !== idx + 1);
      if (badIndex !== -1) {
        results.push({
          modelNumber: data.modelNumber,
          ok: false,
          error: `يجب ترقيم المقاطع تسلسلياً من 1 إلى ${data.segmentsCount}`,
        });
        continue;
      }

      try {
        // رفع النسخة الأصلية للملف على وحدة التخزين إن وُجدت (مع حد أقصى للحجم)
        // — بعد نجاح التحقق بالكامل حتى لا يُرفع ملف عنصر مرفوض
        if (item.fileBuffer && item.fileName) {
          const base64 = item.fileBuffer.split(",")[1] ?? item.fileBuffer;
          if (base64.length > 2 * 1024 * 1024 * 1.34) {
            results.push({
              modelNumber: data.modelNumber,
              ok: false,
              error: "حجم ملف النموذج كبير جداً (الحد الأقصى 2MB)",
            });
            continue;
          }
          const buffer = Buffer.from(base64, "base64");
          if (buffer.byteLength > 2 * 1024 * 1024) {
            results.push({
              modelNumber: data.modelNumber,
              ok: false,
              error: "حجم ملف النموذج يتجاوز 2MB",
            });
            continue;
          }
          await uploadFile(
            buffer,
            `model-${data.modelNumber}-${Date.now()}.json`,
            "application/json"
          );
        }

        // إدراج النموذج في بنك الأسئلة ضمن دفعة جماعية (createMany + skipDuplicates) — B.5
        modelsToCreate.push({
          modelNumber: data.modelNumber,
          branch: data.branch,
          detailsJSON: { segments },
          segmentsCount: data.segmentsCount,
          tenantId,
        });

        results.push({ modelNumber: data.modelNumber, ok: true });
      } catch {
        results.push({
          modelNumber: data.modelNumber,
          ok: false,
          error: "تعذر استيراد النموذج (قد يكون مكرراً أو غير صالح)",
        });
      }
    }

    // تنفيذ الإدراج الجماعي في استدعاء واحد (تجاهل المكرر حسب القيد الفريد)
    let imported = 0;
    if (modelsToCreate.length > 0) {
      const r = await prisma.questionBankModel.createMany({
        data: modelsToCreate,
        skipDuplicates: true,
      });
      imported = r.count;
    }

    return NextResponse.json({
      imported,
      failed: results.length - imported,
      results,
    });
  } catch (e) {
    // لا نكشف تفاصيل داخلية (OWASP — Security Misconfiguration)،
    // ونفرّق خطأ الصلاحية عن خطأ الخادم في رمز الحالة فقط.
    if (e instanceof Error && e.message.startsWith("غير مصرح")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "تعذر إكمال الاستيراد" },
      { status: 500 }
    );
  }
}