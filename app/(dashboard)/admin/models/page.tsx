import { redirect } from "next/navigation";
import { requireUser, requireRole } from "@/lib/security";
import { Role } from "@prisma/client";

export const metadata = { title: "بنك الأسئلة" };

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const user = await requireUser();
  requireRole(user, [Role.ADMIN]);

  // النماذج أصبحت في بنك الأسئلة فقط (بلا موسم ولا لجنة) — المهمة I
  redirect("/admin/question-bank");
}