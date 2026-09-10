"use client";

import { getBranchLabel } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToSession } from "@/lib/realtime-client";
import {
  saveAssessment,
  approveAssessment,
} from "@/lib/actions/assessment-actions";
import {
  MEMORIZATION_SCORE,
  RECITATION_SCORE_MAX,
  TAJWEED_SCORE_MAX,
  SCORE_FULL,
} from "@/lib/score-config";
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

type StudentForAssess = {
  id: string;
  name: string;
  branch: string;
};

type Segment = {
  number: number;
  fromText: string;
  fromSurah: string;
  fromVerse: number;
  toText: string;
  toSurah: string;
  toVerse: number;
};

type Settings = {
  errorDeduction: number;
  doubtDeduction: number;
  tajweedDeduction: number;
};

type Props = {
  student: StudentForAssess;
  sessionId: string;
  seniorIsUser: boolean;
  evaluatorId: string;
  segments: Segment[];
  modelNumber: number;
  settings: Settings;
};

type EvaluationKeys = "errorCount" | "doubtCount" | "tajweedErrors";

type SegmentState = Record<EvaluationKeys, number>;
type Counts = Record<string, SegmentState>;

type Incoming = {
  evaluatorId?: string;
  counts?: Record<string, SegmentState>;
  assessmentStatus?: string;
};

function emptySegment(): SegmentState {
  return { errorCount: 0, doubtCount: 0, tajweedErrors: 0 };
}

function emptyCounts(segments: Segment[]): Counts {
  const map: Counts = {};
  for (const seg of segments) {
    map[String(seg.number)] = emptySegment();
  }
  return map;
}

export function AssessmentBoard({
  student,
  sessionId,
  seniorIsUser,
  evaluatorId,
  segments,
  modelNumber,
  settings,
}: Props) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>(() => emptyCounts(segments));
  const [recitationScore, setRecitationScore] = useState(0);
  const [tajweedScore, setTajweedScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // المزامنة الحية
  useEffect(() => {
    if (locked) return;
    const unsubscribe = subscribeToSession(sessionId, (incoming: Incoming) => {
      if (incoming.assessmentStatus && incoming.assessmentStatus !== "DRAFT") {
        setLocked(true);
        return;
      }
      if (incoming.counts) {
        setCounts((prev) => {
          const merged: Counts = {};
          for (const seg of segments) {
            const key = String(seg.number);
            const current = prev[key] ?? emptySegment();
            const incomingSeg = incoming.counts?.[key];
            merged[key] = incomingSeg
              ? { ...emptySegment(), ...incomingSeg }
              : current;
          }
          return merged;
        });
      }
    });
    return unsubscribe;
  }, [sessionId, segments, locked]);

  // استرجاع التقييم المحفوظ
  useEffect(() => {
    (async () => {
      try {
        const { getAssessmentState } = await import(
          "@/lib/actions/assessment-actions"
        );
        const states = await getAssessmentState(sessionId);
        const mine = states.find((s) => s.evaluatorId === evaluatorId);
        if (mine) {
          // تحويل الحقول القديمة (إن وُجدت) إلى التنسيق الجديد
          const merged: Counts = emptyCounts(segments);
          for (const seg of segments) {
            const key = String(seg.number);
            // إذا كان الحفظ القديم موجوداً (7 أعمدة)، ندمجه في errorCount
            const oldErrors =
              (mine as Record<string, unknown>).wordErrors ??
              0;
            const hasOldFormat = typeof oldErrors === "number" && oldErrors > 0;
            if (hasOldFormat) {
              const r = mine as unknown as Record<string, number>;
              merged[key] = {
                errorCount:
                  (r.wordErrors ?? 0) +
                  (r.letterErrors ?? 0) +
                  (r.diacriticErrors ?? 0) +
                  (r.seriousErrors ?? 0) +
                  (r.subtleErrors ?? 0) +
                  (r.promptingCount ?? 0),
                doubtCount: r.doubtCount ?? 0,
                tajweedErrors: r.tajweedErrors ?? 0,
              };
            } else {
              merged[key] = {
                errorCount: (mine as unknown as Record<string, number>).errorCount ?? 0,
                doubtCount: mine.doubtCount,
                tajweedErrors: (mine as unknown as Record<string, number>).tajweedErrors ?? 0,
              };
            }
          }
          setCounts(merged);
          setRecitationScore(mine.recitationScore);
          setTajweedScore(mine.tajweedScore);
          if (mine.status !== "DRAFT") setLocked(true);
        }
      } catch {
        // تجاهل
      } finally {
        setLoaded(true);
      }
    })();
  }, [sessionId, evaluatorId, segments]);

  function increment(segment: number, field: EvaluationKeys) {
    if (locked) {
      setError("التقييم معتمد — لا يمكن تعديله بعد الآن");
      return;
    }
    setError("");
    setMessage("");
    setCounts((prev) => {
      const key = String(segment);
      const current = prev[key] ?? emptySegment();
      const next: Counts = { ...prev };
      next[key] = { ...current, [field]: current[field] + 1 };
      return next;
    });
  }

  function decrement(segment: number, field: EvaluationKeys) {
    if (locked) return;
    setCounts((prev) => {
      const key = String(segment);
      const current = prev[key] ?? emptySegment();
      if (current[field] <= 0) return prev;
      const next: Counts = { ...prev };
      next[key] = { ...current, [field]: current[field] - 1 };
      return next;
    });
  }

  // حساب نسبة التقدم
  const progressPercent = useMemo(() => {
    let filled = 0;
    for (const seg of segments) {
      const c = counts[String(seg.number)];
      if (c) {
        const hasData = Object.values(c).some((v) => v > 0);
        if (hasData) filled++;
      }
    }
    return segments.length > 0 ? Math.round((filled / segments.length) * 100) : 0;
  }, [counts, segments]);

  // الإجماليات
  const totals = useMemo(() => {
    let totalErrors = 0;
    let totalDoubts = 0;
    let totalTajweedErrors = 0;
    for (const seg of segments) {
      const c = counts[String(seg.number)] ?? emptySegment();
      totalErrors += c.errorCount;
      totalDoubts += c.doubtCount;
      totalTajweedErrors += c.tajweedErrors;
    }
    const errorDeduction = totalErrors * settings.errorDeduction;
    const doubtDeduction = totalDoubts * settings.doubtDeduction;
    const tajweedDeduction = totalTajweedErrors * settings.tajweedDeduction;
    const totalDeduction = errorDeduction + doubtDeduction + tajweedDeduction;
    const memorizationScore = Math.max(0, MEMORIZATION_SCORE - totalDeduction);
    const finalScore = Math.max(
      0,
      Math.min(
        SCORE_FULL,
        memorizationScore + recitationScore + tajweedScore
      )
    );
    return {
      totalErrors,
      totalDoubts,
      totalTajweedErrors,
      errorDeduction,
      doubtDeduction,
      tajweedDeduction,
      totalDeduction,
      memorizationScore,
      finalScore,
    };
  }, [counts, segments, recitationScore, tajweedScore, settings]);

  async function handleSaveDraft() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      // تحويل إلى التنسيق القديم للتوافق مع القاعدة
      const res = await saveAssessment({
        examSessionId: sessionId,
        wordErrors: totals.totalErrors,
        letterErrors: 0,
        diacriticErrors: 0,
        seriousErrors: 0,
        subtleErrors: 0,
        promptingCount: 0,
        doubtCount: totals.totalDoubts,
        tajweedErrors: totals.totalTajweedErrors,
        recitationScore,
        tajweedScore,
      });
      setMessage(`تم الحفظ كمسودة — الدرجة الحالية: ${res.finalScore} من ${SCORE_FULL}`);
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
        wordErrors: totals.totalErrors,
        letterErrors: 0,
        diacriticErrors: 0,
        seriousErrors: 0,
        subtleErrors: 0,
        promptingCount: 0,
        doubtCount: totals.totalDoubts,
        tajweedErrors: totals.totalTajweedErrors,
        recitationScore,
        tajweedScore,
      });
      await approveAssessment(sessionId, action);
      setLocked(true);
      setMessage(
        action === "approve"
          ? "تم اعتماد التقييم من المعلم الأكبر — اللوحة مقفلة"
          : "تم الاعتماد النهائي — اللوحة مقفلة"
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    }
  }

  return (
    <div className="space-y-6">
      {/* الرأس + معلومات النموذج */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">التقييم التفاعلي</h1>
              <p className="mt-1 text-muted-foreground">
                الطالب: <span className="font-medium">{student.name}</span> —{" "}
                {getBranchLabel(student.branch)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">رقم النموذج</p>
                <p className="text-2xl font-bold text-primary">{modelNumber}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">نسبة التقدم</p>
                <div className="relative h-16 w-16">
                  <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-muted/30"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={`${progressPercent} 100`}
                      className="text-primary transition-all duration-300"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                    {progressPercent}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* جدول التقييم — 3 أزرار فقط */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            جدول التقييم ({segments.length} مقاطع)
          </CardTitle>
          <CardDescription>
            3 أزرار لكل مقطع: خطأ (خصم {settings.errorDeduction}) — شك (خصم{" "}
            {settings.doubtDeduction}) — تجويد (خصم {settings.tajweedDeduction})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right font-medium">المقطع</th>
                  <th className="p-2 text-center font-medium">
                    خطأ ({settings.errorDeduction})
                  </th>
                  <th className="p-2 text-center font-medium">
                    شك ({settings.doubtDeduction})
                  </th>
                  <th className="p-2 text-center font-medium">
                    تجويد ({settings.tajweedDeduction})
                  </th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => {
                  const c = counts[String(seg.number)] ?? emptySegment();
                  return (
                    <tr key={seg.number} className="border-b">
                      <td className="p-2">
                        <p className="font-medium">م{seg.number}</p>
                        <p className="text-xs text-muted-foreground" dir="rtl">
                          {seg.fromText.slice(0, 40)}...
                        </p>
                      </td>
                      {(
                        [
                          { key: "errorCount" as const, label: "خطأ" },
                          { key: "doubtCount" as const, label: "شك" },
                          { key: "tajweedErrors" as const, label: "تجويد" },
                        ] as const
                      ).map((col) => (
                        <td key={col.key} className="p-2 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => decrement(seg.number, col.key)}
                              disabled={locked || c[col.key] <= 0}
                            >
                              −
                            </Button>
                            <span className="inline-block min-w-6 text-center font-semibold">
                              {c[col.key]}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() => increment(seg.number, col.key)}
                              disabled={locked}
                            >
                              +
                            </Button>
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* التلاوة والتجويد التطبيقي */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="recitationScore">
                التلاوة وحسن الأداء (من {RECITATION_SCORE_MAX}) — تُقيّم مباشرة
              </Label>
              <Input
                id="recitationScore"
                type="number"
                min={0}
                max={RECITATION_SCORE_MAX}
                step={0.5}
                value={recitationScore}
                disabled={locked}
                onChange={(e) =>
                  setRecitationScore(Number(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="tajweedScore">
                التجويد التطبيقي (من {TAJWEED_SCORE_MAX}) — يُقيّم مباشرة
              </Label>
              <Input
                id="tajweedScore"
                type="number"
                min={0}
                max={TAJWEED_SCORE_MAX}
                step={0.5}
                value={tajweedScore}
                disabled={locked}
                onChange={(e) =>
                  setTajweedScore(Number(e.target.value) || 0)
                }
              />
            </div>
          </div>

          {/* ملخص الدرجة */}
          <div className="mt-4 rounded-lg border p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">إجمالي الأخطاء</p>
                <p className="text-lg font-bold">{totals.totalErrors}</p>
                <p className="text-xs text-muted-foreground">
                  خصم: {totals.errorDeduction.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">إجمالي الشك</p>
                <p className="text-lg font-bold">{totals.totalDoubts}</p>
                <p className="text-xs text-muted-foreground">
                  خصم: {totals.doubtDeduction.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">أخطاء التجويد</p>
                <p className="text-lg font-bold">{totals.totalTajweedErrors}</p>
                <p className="text-xs text-muted-foreground">
                  خصم: {totals.tajweedDeduction.toFixed(1)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">إجمالي الخصم</p>
                <p className="text-lg font-bold">
                  {totals.totalDeduction.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">درجة الحفظ</p>
                <p className="text-lg font-bold">
                  {totals.memorizationScore.toFixed(1)}/{MEMORIZATION_SCORE}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted p-3">
                <span className="font-medium">
                  الدرجة النهائية (من {SCORE_FULL})
                </span>
                <span className="text-2xl font-bold">
                  {totals.finalScore.toFixed(1)}
                </span>
              </div>
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

      {/* أزرار الحفظ والاعتماد */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          {locked ? (
            <p className="text-sm font-medium text-destructive">
              التقييم معتمد — لا يمكن إجراء أي تعديل إضافي
            </p>
          ) : (
            <>
              <Button onClick={handleSaveDraft} disabled={saving || !loaded}>
                {saving ? "جارٍ الحفظ..." : "حفظ كمسودة"}
              </Button>

              {seniorIsUser ? (
                <Button
                  onClick={() => handleApprove("approve")}
                  variant="secondary"
                >
                  اعتماد (المعلم الأكبر)
                </Button>
              ) : (
                <Button
                  onClick={() => handleApprove("finalize")}
                  variant="default"
                >
                  اعتماد نهائي (المعلم الأصغر)
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
