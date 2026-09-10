"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { allocateCommitteeModelRange } from "@/lib/actions/model-actions";
import { BRANCHES } from "@/lib/validations/assessment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CommitteeOption = {
  id: string;
  label: string;
  allocations: {
    id: string;
    branch: string;
    startModelNumber: number;
    endModelNumber: number;
  }[];
};

type Branch = (typeof BRANCHES)[number];

export function CommitteeModelAllocation({
  committees,
}: {
  committees: CommitteeOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [committeeId, setCommitteeId] = useState("");
  const [branch, setBranch] = useState<Branch>("5");
  const [startModelNumber, setStartModelNumber] = useState("1");
  const [endModelNumber, setEndModelNumber] = useState("10");

  async function handleSubmit() {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (!committeeId) throw new Error("اختر اللجنة أولاً");
      const start = Number(startModelNumber);
      const end = Number(endModelNumber);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error("أرقام النماذج يجب أن تكون أعداداً صحيحة");
      }
      if (start < 1 || end > 100 || start > end) {
        throw new Error("نطاق النماذج يجب أن يكون بين 1 و 100");
      }
      await allocateCommitteeModelRange({
        committeeId,
        branch: branch as Branch,
        startModelNumber: start,
        endModelNumber: end,
      });
      setSuccess("تم توزيع النطاق على اللجنة بنجاح");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزيع النماذج على اللجان</CardTitle>
          <CardDescription>
            حدد نطاق أرقام النماذج (1-100) المخصص لكل لجنة حسب الفرع
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>اللجنة *</Label>
              <Select value={committeeId} onValueChange={setCommitteeId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر اللجنة" />
                </SelectTrigger>
                <SelectContent>
                  {committees.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفرع *</Label>
              <Select value={branch} onValueChange={(v) => setBranch(v as Branch)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANCHES.map((b) => (
                    <SelectItem key={b} value={b}>
                      فرع {b} أجزاء
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>رقم البداية *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={startModelNumber}
                onChange={(e) => setStartModelNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>رقم النهاية *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={endModelNumber}
                onChange={(e) => setEndModelNumber(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
              {success}
            </p>
          )}

          <Button onClick={handleSubmit} disabled={loading || committees.length === 0}>
            {loading ? "جارٍ الحفظ..." : "توزيع النماذج"}
          </Button>
        </CardContent>
      </Card>

      {/* جدول التوزيعات الحالية */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التوزيعات الحالية</CardTitle>
        </CardHeader>
        <CardContent>
          {committees.every((c) => c.allocations.length === 0) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا توجد توزيعات بعد — حدد نطاق النماذج لكل لجنة أعلاه
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-right font-medium">اللجنة</th>
                    <th className="p-2 text-right font-medium">الفرع</th>
                    <th className="p-2 text-right font-medium">النطاق</th>
                  </tr>
                </thead>
                <tbody>
                  {committees
                    .filter((c) => c.allocations.length > 0)
                    .map((c) =>
                      c.allocations.map((a) => (
                        <tr key={a.id} className="border-b">
                          <td className="p-2">{c.label}</td>
                          <td className="p-2">فرع {a.branch} أجزاء</td>
                          <td className="p-2">
                            من {a.startModelNumber} إلى {a.endModelNumber}
                          </td>
                        </tr>
                      ))
                    )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}