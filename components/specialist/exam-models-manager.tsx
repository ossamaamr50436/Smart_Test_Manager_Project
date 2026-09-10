"use client";

import { getBranchLabel } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createExamModel,
  updateExamModel,
  deleteExamModel,
} from "@/lib/actions/model-actions";
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

type SeasonOption = { id: string; name: string };

type Segment = {
  number: number;
  fromText: string;
  fromSurah: string;
  fromVerse: string;
  toText: string;
  toSurah: string;
  toVerse: string;
};

type ModelRow = {
  id: string;
  modelNumber: number;
  branch: string;
  season: { id: string; name: string };
  detailsJSON: unknown;
  segmentsCount?: number;
  _count?: { assessments?: number; sessions?: number };
};

type Branch = (typeof BRANCHES)[number];

const SEGMENT_FIELDS: {
  key: keyof Segment;
  label: string;
  placeholder: string;
  type?: "number";
}[] = [
  { key: "fromText", label: "من قوله تعالى", placeholder: "مثال: يَا أَيُّهَا النَّاسُ" },
  { key: "fromSurah", label: "السورة (البداية)", placeholder: "مثال: البقرة" },
  { key: "fromVerse", label: "الآية (البداية)", placeholder: "مثال: 21", type: "number" },
  { key: "toText", label: "إلى قوله تعالى", placeholder: "مثال: وَإِلَيْهِ تُرْجَعُونَ" },
  { key: "toSurah", label: "السورة (النهاية)", placeholder: "مثال: البقرة" },
  { key: "toVerse", label: "الآية (النهاية)", placeholder: "مثال: 28", type: "number" },
];

const MAX_SEGMENTS = 30;

function emptySegments(count: number): Segment[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    fromText: "",
    fromSurah: "",
    fromVerse: "",
    toText: "",
    toSurah: "",
    toVerse: "",
  }));
}

function segmentsCountFor(m: ModelRow): number {
  if (m.segmentsCount) return m.segmentsCount;
  const raw = m.detailsJSON as { segments?: unknown[] } | null;
  return raw?.segments?.length ?? 10;
}

export function ExamModelsManager({
  seasons,
  models,
}: {
  seasons: SeasonOption[];
  models: ModelRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [modelNumber, setModelNumber] = useState("1");
  const [branch, setBranch] = useState<Branch>("5");
  const [seasonId, setSeasonId] = useState("");
  const [segmentsCount, setSegmentsCount] = useState(10);
  const [segments, setSegments] = useState<Segment[]>(emptySegments(10));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resizeSegments(count: number) {
    setSegments((prev) => {
      if (prev.length === count) return prev;
      if (prev.length > count) return prev.slice(0, count);
      const next = [...prev];
      for (let i = prev.length; i < count; i++) {
        next.push({ number: i + 1, fromText: "", fromSurah: "", fromVerse: "", toText: "", toSurah: "", toVerse: "" });
      }
      return next;
    });
  }

  function resetForm() {
    setEditingId(null);
    setModelNumber("1");
    setBranch("5");
    setSeasonId("");
    setSegmentsCount(10);
    setSegments(emptySegments(10));
    setError("");
    setSuccess("");
  }

  function startEdit(m: ModelRow) {
    setError("");
    setSuccess("");
    setEditingId(m.id);
    setModelNumber(String(m.modelNumber));
    setBranch((BRANCHES.includes(m.branch as Branch) ? m.branch : "5") as Branch);
    const count = segmentsCountFor(m);
    const maxCount = Math.min(Math.max(count, 1), MAX_SEGMENTS);
    setSegmentsCount(maxCount);
    setSegments(() => {
      const raw = m.detailsJSON as { segments?: Segment[] } | null;
      const saved = raw?.segments ?? [];
      return Array.from({ length: maxCount }, (_, i) => {
        const s = saved[i];
        return {
          number: i + 1,
          fromText: s?.fromText ?? "",
          fromSurah: s?.fromSurah ?? "",
          fromVerse: String(s?.fromVerse ?? ""),
          toText: s?.toText ?? "",
          toSurah: s?.toSurah ?? "",
          toVerse: String(s?.toVerse ?? ""),
        };
      });
    });
    setSeasonId(m.season.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateSegment(idx: number, field: Exclude<keyof Segment, "number">, value: string) {
    setSegments((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value } as Segment;
      return next;
    });
  }

  function buildInput() {
    if (!seasonId) throw new Error("اختر الموسم");

    for (const seg of segments) {
      if (
        !seg.fromText.trim() ||
        !seg.fromSurah.trim() ||
        !seg.fromVerse ||
        !seg.toText.trim() ||
        !seg.toSurah.trim() ||
        !seg.toVerse
      ) {
        throw new Error(`المقطع ${seg.number} غير مكتمل — املأ جميع الحقول الستة`);
      }
    }

    return {
      modelNumber: Number(modelNumber),
      branch: branch as Branch,
      seasonId,
      segmentsCount: segments.length,
      segments: segments.map((s) => ({
        number: s.number,
        fromText: s.fromText.trim(),
        fromSurah: s.fromSurah.trim(),
        fromVerse: Number(s.fromVerse),
        toText: s.toText.trim(),
        toSurah: s.toSurah.trim(),
        toVerse: Number(s.toVerse),
      })),
    };
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const input = buildInput();
      if (editingId) {
        await updateExamModel(editingId, input);
        setSuccess("تم تحديث النموذج بنجاح");
      } else {
        await createExamModel(input);
        setSuccess("تم إنشاء النموذج بنجاح");
      }
      resetForm();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");
    setSuccess("");
    try {
      await deleteExamModel(id);
      setConfirmDeleteId(null);
      setSuccess("تم حذف النموذج");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
    }
  }

  return (
    <div className="space-y-6">
      {/* نموذج الإنشاء/التعديل */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "تعديل النموذج" : "إنشاء نموذج اختباري جديد"}
          </CardTitle>
          <CardDescription>
            وفق لائحة اختيار فرع كامل القرآن — حتى 100 نموذج لكل فرع، وعدد مقاطع من 1 إلى 30
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>رقم النموذج (1-100) *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
              />
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
                      {getBranchLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الموسم *</Label>
              <Select value={seasonId} onValueChange={setSeasonId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الموسم" />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>عدد المقاطع (1-30) *</Label>
              <Select
                value={String(segmentsCount)}
                onValueChange={(v) => {
                  const n = Math.min(Math.max(Number(v), 1), MAX_SEGMENTS);
                  setSegmentsCount(n);
                  resizeSegments(n);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: MAX_SEGMENTS }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} مقاطع
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* المقاطع */}
          <div className="space-y-3">
            {segments.map((seg, idx) => (
              <div key={seg.number} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-semibold text-primary-700">
                  المقطع {seg.number} من {segmentsCount}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">من قوله تعالى *</Label>
                    <Input
                      value={seg.fromText}
                      onChange={(e) => updateSegment(idx, "fromText", e.target.value)}
                      placeholder="يَا أَيُّهَا النَّاسُ"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">السورة (البداية) *</Label>
                    <Input
                      value={seg.fromSurah}
                      onChange={(e) => updateSegment(idx, "fromSurah", e.target.value)}
                      placeholder="البقرة"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الآية (البداية) *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={seg.fromVerse}
                      onChange={(e) => updateSegment(idx, "fromVerse", e.target.value)}
                      placeholder="21"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">إلى قوله تعالى *</Label>
                    <Input
                      value={seg.toText}
                      onChange={(e) => updateSegment(idx, "toText", e.target.value)}
                      placeholder="وَإِلَيْهِ تُرْجَعُونَ"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">السورة (النهاية) *</Label>
                    <Input
                      value={seg.toSurah}
                      onChange={(e) => updateSegment(idx, "toSurah", e.target.value)}
                      placeholder="البقرة"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الآية (النهاية) *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={seg.toVerse}
                      onChange={(e) => updateSegment(idx, "toVerse", e.target.value)}
                      placeholder="28"
                    />
                  </div>
                </div>
              </div>
            ))}
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

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSubmit} disabled={loading}>
              {loading
                ? "جارٍ الحفظ..."
                : editingId
                  ? "حفظ التعديلات"
                  : "إنشاء النموذج"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>
                إلغاء التعديل
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* جدول النماذج */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            النماذج الاختبارية — {models.length}
          </CardTitle>
          <CardDescription>
            {models.length === 0
              ? "لا توجد نماذج بعد — أنشئ أول نموذج أعلاه"
              : "عرض وتعديل وحذف — حتى 100 نموذج لكل فرع"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right font-medium">رقم النموذج</th>
                  <th className="p-2 text-right font-medium">الفرع</th>
                  <th className="p-2 text-right font-medium">الموسم</th>
                  <th className="p-2 text-right font-medium">المقاطع</th>
                  <th className="p-2 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const segCount = segmentsCountFor(m);
                  return (
                    <tr key={m.id} className="border-b">
                      <td className="p-2 font-medium">{m.modelNumber}</td>
                      <td className="p-2">{getBranchLabel(m.branch)}</td>
                      <td className="p-2">{m.season.name}</td>
                      <td className="p-2">{segCount}</td>
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(m)}
                          >
                            تعديل
                          </Button>
                          {confirmDeleteId === m.id ? (
                            <>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(m.id)}
                              >
                                تأكيد الحذف
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                إلغاء
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(m.id)}
                            >
                              حذف
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}