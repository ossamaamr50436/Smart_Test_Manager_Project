import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { assertPasswordChanged } from "@/lib/password-gate";

const f = createUploadthing();

/**
 * بوابة موحّدة لكل الرافعات:
 * 1) تسجيل الدخول مطلوب.
 * 2) المستخدم المُجبر على تغيير كلمة المرور لا يرفع أي ملف قبل تغييرها
 *    (نفس قاعدة المسارات في middleware/تخطيط اللوحة — المصدر DB عبر getCurrentUser).
 */
function requireUploader() {
  return getCurrentUser().then((user) => {
    if (!user) {
      throw new UploadThingError("يجب تسجيل الدخول أولاً");
    }
    assertPasswordChanged(user);
    return user;
  });
}

export const ourFileRouter = {
  // شعار المنصة — SUPER_ADMIN فقط
  logoUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await requireUploader();
      if (user.role !== "SUPER_ADMIN") {
        throw new UploadThingError("غير مصرح برفع شعار");
      }
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),

  // قالب الشهادة PDF — ADMIN / SUPER_ADMIN فقط
  certificateTemplateUploader: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const user = await requireUploader();
      if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new UploadThingError("غير مصرح برفع قالب الشهادات");
      }
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),

  // PDF طلاب/نماذج — أي مستخدم مصادق غير مجبر
  examModelUploader: f({ pdf: { maxFileSize: "16MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await requireUploader();
      return { userId: user.id, tenantId: user.tenantId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),

  // ملف الشهادة النهائي — CERTIFICATE_SOURCE فقط (مرفوع من الواجهة أو PDF مولّد)
  certificateUploader: f({ pdf: { maxFileSize: "16MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await requireUploader();
      if (user.role !== "CERTIFICATE_SOURCE") {
        throw new UploadThingError("غير مصرح برفع ملف شهادة");
      }
      return { userId: user.id, tenantId: user.tenantId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;