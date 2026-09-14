"use client";

import { useMemo, useState } from "react";
import { Search, FileText, BadgeCheck, Send, BarChart3 } from "lucide-react";
import { CertificateStatus } from "@prisma/client";
import type { CertificateRow } from "@/app/(dashboard)/institution/certificates/page";
import { getBranchLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  [CertificateStatus.PENDING]: "بانتظار التوقيع",
  [CertificateStatus.SIGNED]: "موقّعة",
  [CertificateStatus.UPLOADED]: "مرفوعة",
  [CertificateStatus.SENT]: "مُرسَلة",
};

const STATUS_STYLES: Record<string, string> = {
  [CertificateStatus.PENDING]: "bg-amber-100 text-amber-700",
  [CertificateStatus.SIGNED]: "bg-sky-100 text-sky-700",
  [CertificateStatus.UPLOADED]: "bg-indigo-100 text-indigo-700",
  [CertificateStatus.SENT]: "bg-emerald-100 text-emerald-700",
};

type Props = {
  certificates: CertificateRow[];
  stats: { total: number; pendingSignature: number; sent: number };
  years: number[];
  branches: string[];
};

export function InstitutionCertificatesClient({
  certificates,
  stats,
  years,
  branches,
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [year, setYear] = useState<string>("ALL");
  const [branch, setBranch] = useState<string>("ALL");

  const filtered = useMemo(() => {
    return certificates.filter((c) => {
      if (search && !c.studentName.includes(search.trim())) return false;
      if (status !== "ALL" && c.status !== status) return false;
      if (year !== "ALL" && c.issuedDate?.getFullYear() !== Number(year)) return false;
      if (branch !== "ALL" && c.branch !== branch) return false;
      return true;
    });
  }, [certificates, search, status, year, branch]);

  const statCards = [
    {
      label: "إجمالي الشهادات",
      value: stats.total,
      icon: BarChart3,
      style: "bg-primary-100 text-primary-700",
    },
    {
      label: "بانتظار التوقيع",
      value: stats.pendingSignature,
      icon: BadgeCheck,
      style: "bg-amber-100 text-amber-700",
    },
    {
      label: "مُرسَلة",
      value: stats.sent,
      icon: Send,
      style: "bg-emerald-100 text-emerald-700",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center gap-3 pt-6">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.style}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-xl font-bold">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            شهادات الطلاب ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث باسم الطالب…"
                className="pr-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الحالات</SelectItem>
                {Object.values(CertificateStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="السنة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل السنوات</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger>
                <SelectValue placeholder="الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">كل الفروع</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {getBranchLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              لا توجد شهادات مطابقة للفلترة
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="pb-2 font-medium">اسم الطالب</th>
                    <th className="pb-2 font-medium">الفرع</th>
                    <th className="pb-2 font-medium">رقم الشهادة</th>
                    <th className="pb-2 font-medium">الدرجة</th>
                    <th className="pb-2 font-medium">تاريخ الإصدار</th>
                    <th className="pb-2 font-medium">الحالة</th>
                    <th className="pb-2 font-medium">الشهادة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">{c.studentName}</td>
                      <td className="py-3">{getBranchLabel(c.branch)}</td>
                      <td className="py-3" dir="ltr">
                        {c.serialNumber}
                      </td>
                      <td className="py-3">{c.finalScore.toFixed(2)} / 100</td>
                      <td className="py-3">
                        {c.issuedDate
                          ? c.issuedDate.toLocaleDateString("ar-SA")
                          : "—"}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[c.status] ?? "bg-secondary-100 text-primary-700"
                          }`}
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="py-3">
                        {c.fileUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={c.fileUrl} target="_blank" rel="noreferrer">
                              <FileText className="h-4 w-4" />
                              عرض / تحميل
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            غير متوفرة بعد
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}