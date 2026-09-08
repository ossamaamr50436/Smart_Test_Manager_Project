import { NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { uploadExamModelFile } from "@/lib/google-drive";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * استيراد النماذج الاختبارية من ملف JSON
 * عزل الصلاحيات: أخصائي الاختبارات فقط (المادة 8).
 *
 * يرفع ملف النموذج على Google Drive (المادة 3) ويسجّل بياناته
 * في قاعدة البيانات لضمان عدم تكرار النموذج في الموسم (المادة 6).
 *
 * تنسيق JSON المتوقع:
 * [
 *   { "modelNumber": 1, "institutionId": "...", "details": { ... } , "seasonId": "..." }
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

    for (const item of body) {
      const modelNumber = Number(item?.modelNumber);
      const institutionId = item?.institutionId as string;

      if (!Number.isInteger(modelNumber) || modelNumber < 1 || modelNumber > 100) {
        results.push({
          modelNumber: Number(item?.modelNumber) || 0,
          ok: false,
          error: "modelNumber يجب أن يكون رقماً صحيحاً بين 1 و 100",
        });
        continue;
      }

      if (!institutionId || typeof institutionId !== "string" || institutionId.length > 64) {
        results.push({
          modelNumber,
          ok: false,
          error: "يجب تحديد institutionId صحيح",
        });
        continue;
      }

      try {
        // رفع النسخة الأصلية للملف على Drive إن وُجدت (مع حد أقصى للحجم)
        let driveRef: { fileId: string; webViewLink: string } | null = null;
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
          driveRef = await uploadExamModelFile(
            buffer,
            `model-${modelNumber}-${Date.now()}.json`,
            "application/json"
          );
        }

        const detailsJSON =
          item?.details ??
          (driveRef
            ? { source: "drive", fileId: driveRef.fileId, name: `model-${modelNumber}` }
            : {});

        // إدراج النموذج (مع تجاهل التكرار حسب القيد الفريد للموسم)
        await prisma.examModel.create({
          data: {
            modelNumber,
            detailsJSON,
            institutionId,
            seasonId: item?.seasonId && typeof item.seasonId === "string" && item.seasonId.length <= 64
              ? item.seasonId
              : null,
          },
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

    const imported = results.filter((r) => r.ok).length;

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
