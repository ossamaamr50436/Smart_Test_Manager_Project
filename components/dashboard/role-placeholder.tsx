import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RolePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قيد التطوير</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            هذا القسم مخصص لدورك وسيُبنى في المراحل القادمة من المشروع.{" "}
            <Link href="/dashboard" className="text-primary underline">
              العودة للوحة الرئيسية
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}