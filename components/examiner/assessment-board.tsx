"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import {
  saveAssessment,
  approveAssessment,
  ERROR_PENALTY,
  DOUBT_PENALTY,
  TAJWEED_PENALTY,
  SCORE_FULL,
} from "@/lib/actions/assessment-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StudentForAssess = {
  id: string;
  name: string;
  branch: string;
};

type Props = {
  student: StudentForAssess;
  sessionId: string;
  seniorIsUser: boolean;
  evaluatorId: string;
  segments: string[];
};

// حالة كل مقطع
type SegmentState = {
  errors: number;
  doubts: number;
  tajweed: number;
};

type Incoming = {
  evaluatorId?: string;
  counts?: Record<string, SegmentState>;
};

function emptyCounts(segments: string[]): Record<string, SegmentState> {
  const map: Record<string, SegmentState> = {};
  for (const seg of segments) {
    map[seg] = { errors: 0, doubts: 0, tajweed: 0 };
  }
  return map;
}

export function AssessmentBoard({
  student,
  sessionId,
  seniorIsUser,
  evaluatorId,
  segments,
}: Props) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, SegmentState>>(() =>
    emptyCounts(segments)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // المزامنة الحية (Socket.IO — تمهيد)
  // يُبثّ أي تغيير لبقية المعلمين في نفس اللجنة بدون إعادة تحميل
  useEffect(() => {
    const socket = connectSocket();
    socket.emit("join:assessment", { sessionId });
    socket.on("assessment:update", (incoming: Incoming) => {
      if (incoming.counts) {
        setCounts((prev) => {
          // دمج التحديثات الواردة مع الحالة المحلية
          const merged: Record<string, SegmentState> = {};
          for (const seg of segments) {
            const current = prev[seg] ?? { errors: 0, doubts: 0, tajweed: 0 };
            merged[seg] = {
              errors: incoming.counts?.[seg]?.errors ?? current.errors,
              doubts: incoming.counts?.[seg]?.doubts ?? current.doubts,
              tajweed: incoming.counts?.[seg]?.tajweed ?? current.tajweed,
            };
          }
          return merged;
        });
      }
    });
    return () => {
      socket.off("assessment:update");
      disconnectSocket();
    };
  }, [sessionId, segments]);

  // إجمالي العدّ للعرض والحساب
  const totals = useMemo(() => {
    let errors = 0;
    let doubts = 0;
    let tajweed = 0;
    for (const seg of segments) {
      const c = counts[seg] ?? { errors: 0, doubts: 0, tajweed: 0 };
      errors += c.errors;
      doubts += c.doubts;
      tajweed += c.tajweed;
    }
    const totalDeduction =
      errors * ERROR_PENALTY + doubts * DOUBT_PENALTY + tajweed * TAJWEED_PENALTY;
    const finalScore = Math.max(0, Math.min(SCORE_FULL, SCORE_FULL - totalDeduction));
    return { errors, doubts, tajweed, totalDeduction, finalScore };
  }, [counts, segments]);

  function increment(segment: string, field: keyof SegmentState) {
    setError("");
    setMessage("");
    setCounts((prev) => {
      const current = prev[segment] ?? { errors: 0, doubts: 0, tajweed: 0 };
      const next: Record<string, SegmentState> = { ...prev };
      next[segment] = {
        ...current,
        [field]: current[field] + 1,
      };
      // بثّ التحديث للجنة عبر الـ WebSocket
      const socket = connectSocket();
      socket.emit("assessment:update", {
        sessionId,
        evaluatorId,
        counts: next,
      });
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await saveAssessment({
        examSessionId: sessionId,
        errorsCount: totals.errors,
        doubtsCount: totals.doubts,
        tajweedCount: totals.tajweed,
      });
      setMessage(`تم الحفظ — الدرجة النهائية: ${res.finalScore} من ${SCORE_FULL}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(action: "approve" | "finalize") {
    setError("");
    setMessage("");
    try {
      await saveAssessment({
        examSessionId: sessionId,
        errorsCount: totals.errors,
        doubtsCount: totals.doubts,
        tajweedCount: totals.tajweed,
      });
      const res = await approveAssessment(sessionId, action);
      setMessage(
        action === "approve"
          ? "تم اعتماد التقييم من المعلم الأكبر"
          : "تم الاعتماد النهائي"
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">التقييم الحي</h1>
        <p className="mt-1 text-muted-foreground">
          بيانات الطالب: <span className="font-medium">{student.name}</span> —{" "}
          {student.branch} أجزاء
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">جدول التقييم (5 مقاطع)</CardTitle>
          <CardDescription>
            استخدم زر «+» لتسجيل الخطأ أو الشك أو خطأ التجويد لكل مقطع
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right font-medium">المقطع</th>
                  <th className="p-2 text-center font-medium">الأخطاء (-1)</th>
                  <th className="p-2 text-center font-medium">الشك (-0.5)</th>
                  <th className="p-2 text-center font-medium">التجويد (-0.25)</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => {
                  const c = counts[seg] ?? { errors: 0, doubts: 0, tajweed: 0 };
                  return (
                    <tr key={seg} className="border-b">
                      <td className="p-2 font-medium">{seg}</td>
                      <td className="p-2 text-center">
                        <CellCount
                          value={c.errors}
                          onAdd={() => increment(seg, "errors")}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <CellCount
                          value={c.doubts}
                          onAdd={() => increment(seg, "doubts")}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <CellCount
                          value={c.tajweed}
                          onAdd={() => increment(seg, "tajweed")}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ملخص الخصم والدرجة النهائية */}
          <div className="mt-4 rounded-lg border p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">إجمالي الأخطاء</p>
                <p className="text-lg font-bold">{totals.errors}</p>
              </div>
              <div>
                <p className="text-muted-foreground">إجمالي الشك</p>
                <p className="text-lg font-bold">{totals.doubts}</p>
              </div>
              <div>
                <p className="text-muted-foreground">إجمالي التجويد</p>
                <p className="text-lg font-bold">{totals.tajweed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">إجمالي الخصم</p>
                <p className="text-lg font-bold">{totals.totalDeduction.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-md bg-muted p-3">
              <span className="font-medium">الدرجة النهائية (من {SCORE_FULL})</span>
              <span className="text-2xl font-bold">{totals.finalScore.toFixed(2)}</span>
            </div>
          </div>

          {message && (
            <p className="mt-3 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
              {message}
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* أزرار الحفظ والاعتماد حسب العمر (المادة 5) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "حفظ التقييم"}
          </Button>

          {seniorIsUser ? (
            <Button onClick={() => handleApprove("approve")} variant="secondary">
              اعتماد (المعلم الأكبر)
            </Button>
          ) : (
            <Button onClick={() => handleApprove("finalize")} variant="default">
              اعتماد نهائي (المعلم الأصغر)
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CellCount({ value, onAdd }: { value: number; onAdd: () => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="inline-block min-w-6 text-center font-semibold">{value}</span>
      <Button type="button" size="icon" variant="outline" onClick={onAdd}>
        +
      </Button>
    </div>
  );
}
