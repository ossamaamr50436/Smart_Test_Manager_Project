import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getCurrentUser } from "@/lib/actions/auth-actions";

const f = createUploadthing();

export const ourFileRouter = {
  // شعار المنصة — SUPER_ADMIN فقط
  logoUploader: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== "SUPER_ADMIN") {
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
      const user = await getCurrentUser();
      if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
        throw new UploadThingError("غير مصرح برفع قالب الشهادات");
      }
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),

  // PDF طلاب/نماذج — أي مستخدم مصادق
  examModelUploader: f({ pdf: { maxFileSize: "16MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await getCurrentUser();
      if (!user) {
        throw new UploadThingError("يجب تسجيل الدخول أولاً");
      }
      return { userId: user.id, tenantId: user.tenantId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),

  // ملف الشهادة النهائي — CERTIFICATE_SOURCE فقط (مرفوع من الواجهة أو PDF مولّد)
  certificateUploader: f({ pdf: { maxFileSize: "16MB", maxFileCount: 1 } })
    .middleware(async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== "CERTIFICATE_SOURCE") {
        throw new UploadThingError("غير مصرح برفع ملف شهادة");
      }
      return { userId: user.id, tenantId: user.tenantId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, key: file.key };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;