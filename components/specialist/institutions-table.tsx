"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TypedConfirmDialog } from "@/components/ui/typed-confirm-dialog";
import { deleteInstitution } from "@/lib/actions/entity-actions";

type Institution = {
  id: string;
  name: string;
  managerName: string;
  supervisorName: string;
  managerPhone: string;
  supervisorPhone: string;
  licenseNumber: string;
  district: string;
  createdAt: Date;
  _count: { students: number; users: number };
};

export function InstitutionsTable({ institutions }: { institutions: Institution[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");

  if (institutions.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        لا توجد جهات بعد — أنشئ أول جهة
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <p className="rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          {feedback}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-right">
              <th className="px-3 py-2 font-medium">الجهة</th>
              <th className="px-3 py-2 font-medium">المدير</th>
              <th className="px-3 py-2 font-medium">المشرف</th>
              <th className="px-3 py-2 font-medium">رقم التصريح</th>
              <th className="px-3 py-2 font-medium">الحي</th>
              <th className="px-3 py-2 font-medium">إحصاءات</th>
              <th className="px-3 py-2 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {institutions.map((inst) => (
              <tr key={inst.id} className="border-t">
                <td className="px-3 py-2 font-medium">{inst.name}</td>
                <td className="px-3 py-2">
                  <p>{inst.managerName}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{inst.managerPhone}</p>
                </td>
                <td className="px-3 py-2">
                  <p>{inst.supervisorName}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{inst.supervisorPhone}</p>
                </td>
                <td className="px-3 py-2 tabular-nums" dir="ltr">{inst.licenseNumber}</td>
                <td className="px-3 py-2">{inst.district}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {inst._count.students} طالب — {inst._count.users} مستخدم
                </td>
                <td className="px-3 py-2">
                  <TypedConfirmDialog
                    triggerLabel="حذف"
                    title="حذف الجهة"
                    description={`سيتم حذف «${inst.name}» نهائياً مع كل ارتباطاتها (الطلاب والحسابات) — لا يمكن التراجع.`}
                    nameToType={inst.name}
                    onConfirm={async () => {
                      await deleteInstitution(inst.id);
                      setFeedback(`تم حذف الجهة «${inst.name}»`);
                      router.refresh();
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}