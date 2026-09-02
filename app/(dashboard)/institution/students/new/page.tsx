import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { Role } from "@prisma/client";
import { NominationForm } from "@/components/students/nomination-form";

export const metadata: Metadata = {
  title: "ترشيح طالب جديد",
};

export default async function NewStudentPage() {
  const user = await getCurrentUser();

  // عزل الصلاحيات: صفحة خاصة بالجهات التعليمية
  if (!user || user.role !== Role.INSTITUTION) {
    redirect("/dashboard");
  }

  return (
    <div className="flex justify-center">
      <NominationForm />
    </div>
  );
}