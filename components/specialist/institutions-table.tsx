"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { TypedConfirmDialog } from "@/components/ui/typed-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteInstitution, updateInstitution } from "@/lib/actions/entity-actions";

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

function EditInstitutionDialog({
  institution,
  onSaved,
}: {
  institution: Institution;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({
    name: institution.name,
    managerName: institution.managerName,
    supervisorName: institution.supervisorName,
    managerPhone: institution.managerPhone,
    supervisorPhone: institution.supervisorPhone,
    licenseNumber: institution.licenseNumber,
    district: institution.district,
  }));

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await updateInstitution(institution.id, form);
      if (!result.success) {
        setError("فشل حفظ التعديلات");
        return;
      }
      setOpen(false);
      onSaved(result.noChange ? "لا تغيير في البيانات" : "تم تعديل بيانات الجهة بنجاح");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Pencil className="h-3.5 w-3.5" />
        تعديل
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات الجهة</DialogTitle>
          <DialogDescription>
            عدّل بيانات «{institution.name}» — البريد وكلمة المرور تُدار من الحساب المرتبط.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`name-${institution.id}`}>اسم الجهة *</Label>
            <Input
              id={`name-${institution.id}`}
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`manager-${institution.id}`}>اسم المدير *</Label>
            <Input
              id={`manager-${institution.id}`}
              value={form.managerName}
              onChange={(e) => set("managerName")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`supervisor-${institution.id}`}>اسم المشرف *</Label>
            <Input
              id={`supervisor-${institution.id}`}
              value={form.supervisorName}
              onChange={(e) => set("supervisorName")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mp-${institution.id}`}>جوال المدير *</Label>
            <Input
              id={`mp-${institution.id}`}
              dir="ltr"
              placeholder="+9665XXXXXXXX"
              value={form.managerPhone}
              onChange={(e) => set("managerPhone")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`sp-${institution.id}`}>جوال المشرف *</Label>
            <Input
              id={`sp-${institution.id}`}
              dir="ltr"
              placeholder="+9665XXXXXXXX"
              value={form.supervisorPhone}
              onChange={(e) => set("supervisorPhone")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`license-${institution.id}`}>رقم التصريح *</Label>
            <Input
              id={`license-${institution.id}`}
              dir="ltr"
              value={form.licenseNumber}
              onChange={(e) => set("licenseNumber")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`district-${institution.id}`}>الحي *</Label>
            <Input
              id={`district-${institution.id}`}
              value={form.district}
              onChange={(e) => set("district")(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "جارٍ الحفظ…" : "حفظ التعديلات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
                  <div className="flex items-center gap-2">
                    <EditInstitutionDialog
                      institution={inst}
                      onSaved={(message) => setFeedback(message)}
                    />
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}