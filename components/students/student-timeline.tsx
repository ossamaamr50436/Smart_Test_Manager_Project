import {
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  PenLine,
  Star,
  Trophy,
} from "lucide-react";

export type TimelineStep = {
  id: string;
  title: string;
  date: Date | null;
  description?: string;
  done: boolean;
  icon: "nomination" | "approval" | "assignment" | "exam" | "score" | "final" | "certificate";
};

const ICONS: Record<TimelineStep["icon"], { icon: typeof GraduationCap; color: string }> = {
  nomination: { icon: CalendarPlus, color: "text-sky-600 bg-sky-100" },
  approval: { icon: CheckCircle2, color: "text-emerald-600 bg-emerald-100" },
  assignment: { icon: ClipboardList, color: "text-indigo-600 bg-indigo-100" },
  exam: { icon: PenLine, color: "text-amber-600 bg-amber-100" },
  score: { icon: Trophy, color: "text-orange-600 bg-orange-100" },
  final: { icon: Star, color: "text-violet-600 bg-violet-100" },
  certificate: { icon: FileCheck2, color: "text-rose-600 bg-rose-100" },
};

export function formatTimelineDate(date: Date | null): string {
  if (!date) return "—";
  const gregorian = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
  const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
  return `${hijri} (هجري) — ${gregorian} (ميلادي)`;
}

export function StudentTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-6 border-r-2 border-dashed pr-5">
      {steps.map((step) => {
        const meta = ICONS[step.icon];
        const StepIcon = meta.icon;
        return (
          <li key={step.id} className="relative">
            <span
              className={`absolute -right-[29px] top-0 flex h-8 w-8 items-center justify-center rounded-full ${
                step.done
                  ? meta.color
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <StepIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {step.title}
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <span className="text-xs text-muted-foreground">بانتظار</span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {step.done ? formatTimelineDate(step.date) : "لم يكتمل بعد"}
              </p>
              {step.description && (
                <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}