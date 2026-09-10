import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { Role } from "@prisma/client";
import { NominationForm } from "@/components/students/nomination-form";
import { getPlatformSettings } from "@/lib/actions/settings-actions";

export const metadata: Metadata = {
  title: "ترشيح طالب جديد",
};

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بالجهات التعليمية
  if (!user || user.role !== Role.INSTITUTION) {
    redirect("/");
  }

  const settings = await getPlatformSettings();

  return (
    <div className="flex justify-center">
      <NominationForm
        requireApplicationFile={settings.requireStudentApplicationFile}
      />
    </div>
  );
}