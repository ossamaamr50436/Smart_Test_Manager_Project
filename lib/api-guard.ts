import "server-only";
import { requireUser, type SessionUser } from "@/lib/security";
import { assertPasswordChanged } from "@/lib/password-gate";

/**
 * حارس مسارات `/api/*` (المرحلة 4).
 *
 * matcher في `middleware.ts` يستثني `api/*`، لذلك نطبّق البوابة هنا
 * حتى لا يستطيع مستخدم مُجبر على تغيير كلمة المرور فتح الشهادات أو
 * تصدير الطلاب أو استيراد النماذج قبل تغييرها.
 * تسجيل الخروج (signout) يمر عبر `/api/auth/*` ولا يمر من هذا الحارس.
 */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await requireUser();
  assertPasswordChanged(user);
  return user;
}
