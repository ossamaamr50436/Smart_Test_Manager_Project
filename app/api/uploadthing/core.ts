import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getCurrentUser } from "@/lib/actions/auth-actions";

const f = createUploadthing();

export const ourFileRouter = {
  // شعار المنصة — SUPER_ADMIN فقط
  logoUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
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
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;