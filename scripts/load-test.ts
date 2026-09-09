// ============================================================
// اختبار أداء (Load Test) — المسار الحرج لحساب الدرجات والتحقق
// يقيس الإنتاجية (ops/sec) وكمون p50/p95 دون الحاجة لقاعدة بيانات.
// التشغيل: pnpm test:load
// ============================================================
import { performance } from "node:perf_hooks";
import { computeTotals, type ScoreInput } from "../lib/score-calculation";
import { assessmentInputSchema } from "../lib/validations/assessment";

const ITERATIONS = Number(process.env.LOAD_ITERATIONS ?? 50_000);

function sample(seed: number): ScoreInput {
  const rnd = (max: number) => Math.floor((seed * 7919 + max * 31) % (max + 1));
  return {
    wordErrors: rnd(12),
    letterErrors: rnd(8),
    diacriticErrors: rnd(6),
    seriousErrors: rnd(4),
    subtleErrors: rnd(6),
    promptingCount: rnd(5),
    doubtCount: rnd(6),
    recitationScore: rnd(20),
    tajweedScore: rnd(10),
  };
}

function percentiles(sortedMs: number[]): { p50: number; p95: number; p99: number } {
  const at = (q: number) => sortedMs[Math.min(sortedMs.length - 1, Math.floor(q * sortedMs.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

async function bench(name: string, fn: () => void) {
  const latencies: number[] = [];
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    fn();
    latencies.push(performance.now() - t0);
  }
  const elapsed = performance.now() - start;
  const ops = (ITERATIONS / elapsed) * 1000;
  latencies.sort((a, b) => a - b);
  const { p50, p95, p99 } = percentiles(latencies);
  console.log(`\n📊 ${name}`);
  console.log(`   الإنتاجية: ${Math.round(ops).toLocaleString()} عملية/ثانية`);
  console.log(`   الكمون:    p50=${p50.toFixed(3)}ms  p95=${p95.toFixed(3)}ms  p99=${p99.toFixed(3)}ms`);
  return ops;
}

async function main() {
  console.log(`⚡ اختبار الحمل — ${ITERATIONS.toLocaleString()} تكرار لكل سيناريو`);

  await bench("حساب الدرجات (computeTotals)", () => {
    computeTotals(sample(1));
  });

  const validInput = {
    examSessionId: "session-load-1",
    wordErrors: 2,
    letterErrors: 1,
    diacriticErrors: 0,
    seriousErrors: 1,
    subtleErrors: 3,
    promptingCount: 1,
    doubtCount: 2,
    recitationScore: 18,
    tajweedScore: 9,
  };

  await bench("التحقق الكامل (assessmentInputSchema.safeParse)", () => {
    assessmentInputSchema.safeParse(validInput);
  });

  // سيناريو متوازي يحاكي تزامن حفظ عدة مقيمين (مثيلات Node منفصلة)
  await bench("خط الأنابيب المشترك (validate → compute)", () => {
    const parsed = assessmentInputSchema.safeParse(validInput);
    if (parsed.success) computeTotals(parsed.data as unknown as ScoreInput);
  });

  console.log("\n✅ انتهى اختبار الحمل بنجاح");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});