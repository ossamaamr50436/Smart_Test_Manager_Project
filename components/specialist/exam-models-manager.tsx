"use client";

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

type InstitutionOption = { id: string; name: string };
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
  institution: { id: string; name: string };
  season: { id: string; name: string };
  detailsJSON: unknown;
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

function emptySegments(): Segment[] {
  return Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    fromText: "",
    fromSurah: "",
    fromVerse: "",
    toText: "",
    toSurah: "",
    toVerse: "",
  }));
}

export function ExamModelsManager({
  institutions,
  seasons,
  models,
}: {
  institutions: InstitutionOption[];
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
  const [institutionId, setInstitutionId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [segments, setSegments] = useState<Segment[]>(emptySegments());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setModelNumber("1");
    setBranch("5");
    setInstitutionId("");
    setSeasonId("");
    setSegments(emptySegments());
    setError("");
    setSuccess("");
  }

  function startEdit(m: ModelRow) {
    setError("");
    setSuccess("");
    setEditingId(m.id);
    setModelNumber(String(m.modelNumber));
    setBranch((BRANCHES.includes(m.branch as Branch) ? m.branch : "5") as Branch);
    setSegments(() => {
      const raw = m.detailsJSON as { segments?: Segment[] } | null;
      const saved = raw?.segments ?? [];
      return Array.from({ length: 10 }, (_, i) => {
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
    // إبقاء الجهة والموسم كما هما للنموذج (نعرضهما لكن نحتفظ بمعرفي النموذج)
    setInstitutionId(m.institution.id);
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
    if (!institutionId) throw new Error("اختر الجهة التعليمية");
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
        throw new Error(`المقطع ${seg.number} غير مكتمل — املأ جميع الحقول السبعة`);
      }
    }

    return {
      modelNumber: Number(modelNumber),
      branch: branch as Branch,
      institutionId,
      seasonId,
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
            {editingId ? "تعديل النموذج" : "إنشاء نموذج اختباري جديد (10 مقاطع)"}
          </CardTitle>
          <CardDescription>
            وفق لائحة اختيار فرع كامل القرآن — املأ حقول المقاطع العشرة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>رقم النموذج (1-20) *</Label>
              <Input
                type="number"
                min={1}
                max={20}
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
                      فرع {b} أجزاء
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الجهة التعليمية *</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الجهة" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
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
          </div>

          {/* المقاطع العشرة */}
          <div className="space-y-3">
            {segments.map((seg, idx) => (
              <div key={seg.number} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-semibold text-primary-700">
                  المقطع {seg.number}
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
              : "20 نموذجاً لكل فرع وفق اللائحة — عرض وتعديل وحذف"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-right font-medium">رقم النموذج</th>
                  <th className="p-2 text-right font-medium">الفرع</th>
                  <th className="p-2 text-right font-medium">الجهة</th>
                  <th className="p-2 text-right font-medium">الموسم</th>
                  <th className="p-2 text-right font-medium">المقاطع</th>
                  <th className="p-2 text-center font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const raw = m.detailsJSON as { segments?: unknown[] } | null;
                  const segCount = raw?.segments?.length ?? 0;
                  return (
                    <tr key={m.id} className="border-b">
                      <td className="p-2 font-medium">{m.modelNumber}</td>
                      <td className="p-2">فرع {m.branch} أجزاء</td>
                      <td className="p-2">{m.institution.name}</td>
                      <td className="p-2">{m.season.name}</td>
                      <td className="p-2">{segCount} / 10</td>
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