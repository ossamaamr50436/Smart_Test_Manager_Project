import * as XLSX from "xlsx";
import * as path from "path";

const file = path.join(process.cwd(), "اسئلة كامل القرآن.xlsx");
const wb = XLSX.readFile(file);
const ws = wb.Sheets["كامل القرآن"]!;
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as unknown[][];

const modelStarts: number[] = [];
const modelTitles: string[] = [];
aoa.forEach((row, i) => {
  const cell = String(row[4] ?? "").trim();
  if (/نموذج رقم/.test(cell)) {
    modelStarts.push(i);
    modelTitles.push(cell);
  }
});
console.log("إجمالي نماذج:", modelStarts.length);
console.log("أول 3:", modelStarts.slice(0,3).map((s,i)=>`${s}: ${modelTitles[i]}`));
console.log("آخر 3:", modelStarts.slice(-3).map((s,i)=>`${s}: ${modelTitles[modelStarts.length-3+i]}`));

// عدد المقاطع لكل نموذج: بين بداية نموذج وبداية النموذج التالي
for (let m = 0; m < modelStarts.length; m++) {
  const start = modelStarts[m]!;
  const end = m + 1 < modelStarts.length ? modelStarts[m + 1]! : aoa.length;
  // صفوف المقاطع الفعلية: رأس (م, من قوله) يتبعه مقاطع
  let segmentCount = 0;
  for (let i = start + 1; i < end; i++) {
    const first = aoa[i]?.[0];
    if (typeof first === "number" && first >= 1) segmentCount++;
  }
  console.log(`نموذج ${m + 1}: ${segmentCount} مقطع`);
}

// تحقق: القيم الرقمية في عمود الآيات أحياناً أرقام، وأحياناً أرقام عربية داخل النص
console.log("\nنموذج صف مقطع:", JSON.stringify(aoa[modelStarts[0]! + 2]));
console.log("نوع عمود الآية (col3) للمقطع 1:", typeof aoa[modelStarts[0]! + 2]![3], JSON.stringify(aoa[modelStarts[0]! + 2]![3]));
console.log("نوع عمود الآية (col6):", typeof aoa[modelStarts[0]! + 2]![6], JSON.stringify(aoa[modelStarts[0]! + 2]![6]));