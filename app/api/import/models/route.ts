import { NextResponse } from "next/server";
import { requireUser, requireRole } from "@/lib/security";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { uploadExamModelFile } from "@/lib/google-drive";

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

    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: "البيانات يجب أن تكون مصفوفة من النماذج" },
        { status: 400 }
      );
    }

    const results: { modelNumber: number; ok: boolean; error?: string }[] = [];

    for (const item of body) {
      const modelNumber = Number(item?.modelNumber);
      const institutionId = item?.institutionId as string;

      if (!modelNumber || !institutionId) {
        results.push({
          modelNumber: Number(item?.modelNumber) || 0,
          ok: false,
          error: "يجب تحديد modelNumber و institutionId",
        });
        continue;
      }

      try {
        // رفع النسخة الأصلية للملف على Drive إن وُجدت
        let driveRef: { fileId: string; webViewLink: string } | null = null;
        if (item?.fileBuffer && item?.fileName) {
          const base64 = String(item.fileBuffer).split(",")[1] ?? String(item.fileBuffer);
          const buffer = Buffer.from(base64, "base64");
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
            seasonId: item?.seasonId ?? null,
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
