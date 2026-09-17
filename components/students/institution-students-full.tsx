"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { getBranchLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRANCHES, PERIODS } from "@/lib/validations/student";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  ASSIGNED: "تم توزيعه على لجنة",
  COMPLETED: "اكتمل تقييمه",
  NOTIFIED: "بانتظار اعتماد رئيس الشؤون",
  READY_FOR_CERTIFICATE: "جاهز لإصدار الشهادة",
  CERTIFICATE_ISSUED: "صدرت شهادته",
};

const CERT_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار التوقيع",
  SIGNED: "موقّعة",
  UPLOADED: "مرفوعة",
  SENT: "مُرسَلة",
};

type StudentRow = {
  id: string;
  name: string;
  age: number;
  branch: string;
  nationality: string;
  teacherName: string;
  parentPhone: string | null;
  address: string | null;
  status: string;
  createdAt: Date | string;
  approvedAt: Date | string | null;
  committee: { name: string } | null;
  examSessions: {
    examDate: Date | string;
    period: string;
    assessments: { finalScore: number; status: string }[];
  }[];
  certificates: { serialNumber: string; status: string }[];
};

type Props = { students: StudentRow[] };

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-SA");
}

export function InstitutionStudentsFull({ students }: Props) {
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (branch && s.branch !== branch) return false;
      if (status && s.status !== status) return false;
      if (period && !s.examSessions.some((session) => session.period === period)) {
        return false;
      }
      return true;
    });
  }, [students, search, branch, status, period]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">البحث والفلترة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>بحث بالاسم</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} dir="rtl" placeholder="اسم الطالب..." />
            </div>
            <div className="space-y-1">
              <Label>الفرع</Label>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">جميع الفروع</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{getBranchLabel(b)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>الحالة</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">جميع الحالات</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>الفترة</Label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">جميع الفترات</option>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الطلاب ({rows.length})</CardTitle>
          <CardDescription>
            الاسم، العمر، الجنسية، الفرع، المعلم، رقم ولي الأمر، العنوان، تواريخ الترشيح/القبول/الاختبار، الفترة، اللجنة، الدرجة، الشهادة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              لا يوجد طلاب مطابقون
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-right font-medium">الاسم</th>
                    <th className="p-2 text-right font-medium">العمر</th>
                    <th className="p-2 text-right font-medium">الجنسية</th>
                    <th className="p-2 text-right font-medium">الفرع</th>
                    <th className="p-2 text-right font-medium">اسم المعلم</th>
                    <th className="p-2 text-right font-medium">رقم ولي الأمر</th>
                    <th className="p-2 text-right font-medium">العنوان</th>
                    <th className="p-2 text-right font-medium">تاريخ الترشيح</th>
                    <th className="p-2 text-right font-medium">تاريخ القبول</th>
                    <th className="p-2 text-right font-medium">تاريخ الاختبار</th>
                    <th className="p-2 text-right font-medium">الفترة</th>
                    <th className="p-2 text-right font-medium">اللجنة</th>
                    <th className="p-2 text-right font-medium">الدرجة</th>
                    <th className="p-2 text-right font-medium">الشهادة</th>
                    <th className="p-2 text-right font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const session = s.examSessions[0] ?? null;
                    const finalAssessment = session?.assessments[0] ?? null;
                    const certificate = s.certificates[0] ?? null;
                    return (
                      <tr key={s.id} className="border-b">
                        <td className="p-2">
                          <Link
                            href={`/institution/students/${s.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="p-2">{s.age}</td>
                        <td className="p-2">{s.nationality || "—"}</td>
                        <td className="p-2">{getBranchLabel(s.branch)}</td>
                        <td className="p-2">{s.teacherName}</td>
                        <td className="p-2" dir="ltr">{s.parentPhone || "—"}</td>
                        <td className="p-2">{s.address || "—"}</td>
                        <td className="p-2">{fmtDate(s.createdAt)}</td>
                        <td className="p-2">{fmtDate(s.approvedAt)}</td>
                        <td className="p-2">{session ? fmtDate(session.examDate) : "لم يُحدَّد"}</td>
                        <td className="p-2">{session?.period ?? "لم يُحدَّد"}</td>
                        <td className="p-2">{s.committee?.name ?? "—"}</td>
                        <td className="p-2">
                          {finalAssessment ? finalAssessment.finalScore.toFixed(2) : "—"}
                        </td>
                        <td className="p-2">
                          {certificate ? (
                            <span className="text-xs">
                              {certificate.serialNumber}
                              <span className="mx-1 text-muted-foreground">—</span>
                              {CERT_STATUS_LABELS[certificate.status] ?? certificate.status}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          <span className="inline-flex rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                            {STATUS_LABELS[s.status] ?? s.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}