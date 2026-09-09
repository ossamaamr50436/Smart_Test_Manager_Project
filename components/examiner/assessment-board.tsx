"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToSession } from "@/lib/realtime-client";
import {
  saveAssessment,
  approveAssessment,
} from "@/lib/actions/assessment-actions";
import {
  WORD_ERROR_PENALTY,
  LETTER_ERROR_PENALTY,
  DIACRITIC_ERROR_PENALTY,
  SERIOUS_ERROR_PENALTY,
  SUBTLE_ERROR_PENALTY,
  PROMPTING_PENALTY,
  DOUBT_PENALTY,
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

type Props = {
  student: StudentForAssess;
  sessionId: string;
  seniorIsUser: boolean;
  evaluatorId: string;
  segments: Segment[];
};

type EvaluationKeys =
  | "wordErrors"
  | "letterErrors"
  | "diacriticErrors"
  | "seriousErrors"
  | "subtleErrors"
  | "promptingCount"
  | "doubtCount";

// حالة كل مقطع: عدّادات التقييم السبعة
type SegmentState = Record<EvaluationKeys, number>;

type Counts = Record<string, SegmentState>;

type Incoming = {
  evaluatorId?: string;
  counts?: Record<string, SegmentState>;
  assessmentStatus?: string;
};

// الأعمدة السبعة للتقييم (وفق اللائحة)
const COLUMNS: { key: EvaluationKeys; label: string; penalty: number }[] = [
  { key: "wordErrors", label: "أخطاء الكلمات", penalty: WORD_ERROR_PENALTY },
  { key: "letterErrors", label: "أخطاء الحروف", penalty: LETTER_ERROR_PENALTY },
  { key: "diacriticErrors", label: "أخطاء الضبط", penalty: DIACRITIC_ERROR_PENALTY },
  { key: "seriousErrors", label: "اللحن الجلي", penalty: SERIOUS_ERROR_PENALTY },
  { key: "subtleErrors", label: "اللحن الخفي", penalty: SUBTLE_ERROR_PENALTY },
  { key: "promptingCount", label: "التنبيه", penalty: PROMPTING_PENALTY },
  { key: "doubtCount", label: "الشك (التردد)", penalty: DOUBT_PENALTY },
];

function emptySegment(): SegmentState {
  return {
    wordErrors: 0,
    letterErrors: 0,
    diacriticErrors: 0,
    seriousErrors: 0,
    subtleErrors: 0,
    promptingCount: 0,
    doubtCount: 0,
  };
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

  // المزامنة الحية (Pusher)
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
            merged[key] = incomingSeg ? { ...emptySegment(), ...incomingSeg } : current;
          }
          return merged;
        });
      }
    });
    return unsubscribe;
  }, [sessionId, segments, locked]);

  // استرجاع التقييم المحفوظ عند فتح الصفحة وما تبقى من حالة المقيّمين
  useEffect(() => {
    (async () => {
      try {
        const { getAssessmentState } = await import(
          "@/lib/actions/assessment-actions"
        );
        const states = await getAssessmentState(sessionId);
        const mine = states.find((s) => s.evaluatorId === evaluatorId);
        if (mine) {
          const merged: Counts = emptyCounts(segments);
          for (const seg of segments) {
            const key = String(seg.number);
            merged[key] = {
              wordErrors: mine.wordErrors,
              letterErrors: mine.letterErrors,
              diacriticErrors: mine.diacriticErrors,
              seriousErrors: mine.seriousErrors,
              subtleErrors: mine.subtleErrors,
              promptingCount: mine.promptingCount,
              doubtCount: mine.doubtCount,
            };
          }
          setCounts(merged);
          setRecitationScore(mine.recitationScore);
          setTajweedScore(mine.tajweedScore);
          if (mine.status !== "DRAFT") setLocked(true);
        }
      } catch {
        // تجاهل — بدون حفظ أولي
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

  // إجمالي العدّ للعرض والحساب (عبر جميع المقاطع)
  const totals = useMemo(() => {
    const sums: Record<EvaluationKeys, number> = {
      wordErrors: 0,
      letterErrors: 0,
      diacriticErrors: 0,
      seriousErrors: 0,
      subtleErrors: 0,
      promptingCount: 0,
      doubtCount: 0,
    };
    for (const seg of segments) {
      const c = counts[String(seg.number)] ?? emptySegment();
      for (const key of Object.keys(sums) as EvaluationKeys[]) {
        sums[key] += c[key];
      }
    }
    const memorizationDeduction =
      sums.wordErrors * WORD_ERROR_PENALTY +
      sums.letterErrors * LETTER_ERROR_PENALTY +
      sums.diacriticErrors * DIACRITIC_ERROR_PENALTY +
      sums.seriousErrors * SERIOUS_ERROR_PENALTY +
      sums.subtleErrors * SUBTLE_ERROR_PENALTY;
    const promptingDeduction = sums.promptingCount * PROMPTING_PENALTY;
    const doubtDeduction = sums.doubtCount * DOUBT_PENALTY;
    const totalDeduction = memorizationDeduction + promptingDeduction + doubtDeduction;
    const memorizationScore = Math.max(0, MEMORIZATION_SCORE - totalDeduction);
    const finalScore = Math.max(
      0,
      Math.min(
        SCORE_FULL,
        memorizationScore + recitationScore + tajweedScore
      )
    );
    return { sums, memorizationDeduction, totalDeduction, memorizationScore, finalScore };
  }, [counts, segments, recitationScore, tajweedScore]);

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await saveAssessment({
        examSessionId: sessionId,
        wordErrors: totals.sums.wordErrors,
        letterErrors: totals.sums.letterErrors,
        diacriticErrors: totals.sums.diacriticErrors,
        seriousErrors: totals.sums.seriousErrors,
        subtleErrors: totals.sums.subtleErrors,
        promptingCount: totals.sums.promptingCount,
        doubtCount: totals.sums.doubtCount,
        recitationScore,
        tajweedScore,
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
        wordErrors: totals.sums.wordErrors,
        letterErrors: totals.sums.letterErrors,
        diacriticErrors: totals.sums.diacriticErrors,
        seriousErrors: totals.sums.seriousErrors,
        subtleErrors: totals.sums.subtleErrors,
        promptingCount: totals.sums.promptingCount,
        doubtCount: totals.sums.doubtCount,
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
      <div>
        <h1 className="text-2xl font-bold">التقييم الحي</h1>
        <p className="mt-1 text-muted-foreground">
          بيانات الطالب: <span className="font-medium">{student.name}</span> —{" "}
          {student.branch} أجزاء
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">جدول التقييم ({segments.length} مقاطع)</CardTitle>
          <CardDescription>
            وفق لائحة اختيار فرع كامل القرآن — سجّل الأخطاء لكل مقطع
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right font-medium">المقطع</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="p-2 text-center font-medium">
                      {col.label} ({col.penalty})
                    </th>
                  ))}
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
                      {COLUMNS.map((col) => (
                        <td key={col.key} className="p-2 text-center">
                          <CellCount
                            value={c[col.key]}
                            onAdd={() => increment(seg.number, col.key)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="recitationScore">
                التلاوة وحسن الأداء (من {RECITATION_SCORE_MAX}) — تُقيّم من المعلم مباشرة
              </Label>
              <Input
                id="recitationScore"
                type="number"
                min={0}
                max={RECITATION_SCORE_MAX}
                step={0.5}
                value={recitationScore}
                disabled={locked}
                onChange={(e) => setRecitationScore(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="tajweedScore">
                التجويد التطبيقي (من {TAJWEED_SCORE_MAX}) — يُقيّم من المعلم مباشرة
              </Label>
              <Input
                id="tajweedScore"
                type="number"
                min={0}
                max={TAJWEED_SCORE_MAX}
                step={0.5}
                value={tajweedScore}
                disabled={locked}
                onChange={(e) => setTajweedScore(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* ملخص الخصم والدرجة النهائية */}
          <div className="mt-4 rounded-lg border p-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {COLUMNS.map((col) => (
                <div key={col.key}>
                  <p className="text-muted-foreground">{col.label}</p>
                  <p className="text-lg font-bold">{totals.sums[col.key]}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">خصم الحفظ</p>
                <p className="text-lg font-bold">
                  {totals.memorizationDeduction.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">درجة الحفظ النهائية</p>
                <p className="text-lg font-bold">
                  {totals.memorizationScore.toFixed(2)}/{MEMORIZATION_SCORE}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">إجمالي الخصم (تنبيه + شك + أخطاء)</p>
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
          {locked ? (
            <p className="text-sm font-medium text-destructive">
              التقييم معتمد — لا يمكن إجراء أي تعديل إضافي
            </p>
          ) : (
            <>
              <Button onClick={handleSave} disabled={saving || !loaded}>
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
            </>
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