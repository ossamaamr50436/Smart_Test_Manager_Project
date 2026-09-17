import { NextResponse } from "next/server";
import { requireUser, requireRole, requireTenantId } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role, Prisma } from "@prisma/client";
import { uploadFile } from "@/lib/file-storage";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * استيراد النماذج الاختبارية من ملف JSON إلى بنك الأسئلة (المهمة I)
 * عزل الصلاحيات: أخصائي الاختبارات فقط (المادة 8).
 *
 * يرفع ملف النموذج على وحدة التخزين (UploadThing) ويسجّل بياناته
 * في قاعدة البيانات (بنك الأسئلة — بلا موسم أو جهة).
 *
 * تنسيق JSON المتوقع:
 * [
 *   { "modelNumber": 1, "branch": "5", "details": { ... }, "segmentsCount": 10 }
 * ]
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    requireRole(user, [Role.TEST_SPECIALIST, Role.ADMIN]);

    // منع إساءة الاستخدام: حد أقصى 5 عمليات استيراد لكل مستخدم خلال 15 دقيقة
    await checkRateLimit(`import-models:${user.id}`, 5);

    const body = await req.json();
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

    for (const item of body) {
      const modelNumber = Number(item?.modelNumber);
      const branch = String(item?.branch ?? "5");

      if (!Number.isInteger(modelNumber) || modelNumber < 1 || modelNumber > 100) {
        results.push({
          modelNumber: Number(item?.modelNumber) || 0,
          ok: false,
          error: "modelNumber يجب أن يكون رقماً صحيحاً بين 1 و 100",
        });
        continue;
      }

      if (!["5", "10", "15", "20", "25", "30"].includes(branch)) {
        results.push({
          modelNumber,
          ok: false,
          error: "branch يجب أن يكون أحد الأفرع (5/10/15/20/25/30)",
        });
        continue;
      }

      try {
        // رفع النسخة الأصلية للملف على وحدة التخزين إن وُجدت (مع حد أقصى للحجم)
        let storedRef: { fileId: string; url: string } | null = null;
        if (item?.fileBuffer && item?.fileName) {
          const base64 = String(item.fileBuffer).split(",")[1] ?? String(item.fileBuffer);
          if (base64.length > 2 * 1024 * 1024 * 1.34) {
            results.push({
              modelNumber,
              ok: false,
              error: "حجم ملف النموذج كبير جداً (الحد الأقصى 2MB)",
            });
            continue;
          }
          const buffer = Buffer.from(base64, "base64");
          if (buffer.byteLength > 2 * 1024 * 1024) {
            results.push({
              modelNumber,
              ok: false,
              error: "حجم ملف النموذج يتجاوز 2MB",
            });
            continue;
          }
          storedRef = await uploadFile(
            buffer,
            `model-${modelNumber}-${Date.now()}.json`,
            "application/json"
          );
        }

        const detailsJSON = item?.details ?? { segments: [] };

        // إدراج النموذج في بنك الأسئلة ضمن دفعة جماعية (createMany + skipDuplicates) — B.5
        modelsToCreate.push({
          modelNumber,
          branch,
          detailsJSON,
          segmentsCount: Number(item?.segmentsCount) || 0,
          tenantId: requireTenantId(user),
        });

        results.push({ modelNumber, ok: true });
      } catch {
        results.push({
          modelNumber,
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
    // عدم كشف تفاصيل داخلية (OWASP — Security Misconfiguration)
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
}