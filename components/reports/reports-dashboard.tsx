"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type StatCard = { label: string; value: string | number; hint?: string };
export type BarData = { label: string; count: number; color?: string };
export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number>;

type Props = {
  title: string;
  subtitle?: string;
  statCards: StatCard[];
  bars: BarData[];
  columns: ReportColumn[];
  rows: ReportRow[];
  csvFileName: string;
};

function escapeCsv(value: string | number): string {
  const s = String(value);
  const dangerous = /^[=+\-@]/;
  return `"${(dangerous.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
}

export function ReportsDashboard({
  title,
  subtitle,
  statCards,
  bars,
  columns,
  rows,
  csvFileName,
}: Props) {
  const maxCount = Math.max(1, ...bars.map((b) => b.count));

  const exportCsv = () => {
    const header = columns.map((c) => escapeCsv(c.label)).join(",");
    const lines = rows.map((r) => columns.map((c) => escapeCsv(r[c.key] ?? "")).join(","));
    const csv = [header, ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="ml-2 h-4 w-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="ml-2 h-4 w-4" />
            طباعة / PDF
          </Button>
        </div>
      </div>

      {/* بطاقات إحصائية سريعة */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
              <CardDescription>{s.label}</CardDescription>
            </CardHeader>
            {s.hint ? (
              <CardContent>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      {/* مخطط أشرطة (CSS — دون اعتماد على مكتبات) */}
      {bars.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>التوزيع</CardTitle>
            <CardDescription>عرض بياني للتوزيع الحالي</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bars.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm">{b.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className={`h-full rounded ${b.color ?? "bg-primary"}`}
                    style={{ width: `${Math.round((b.count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="w-10 text-left text-sm font-medium">{b.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* الجدول التفصيلي */}
      <Card>
        <CardHeader>
          <CardTitle>التفاصيل</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد بيانات بعد
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  {columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-2">
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}