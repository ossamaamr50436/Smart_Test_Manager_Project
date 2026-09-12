"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return; // منع الضغط المزدوج

    const formData = new FormData(e.currentTarget);
    const formEmail = (formData.get("email") as string) || email;
    const formPassword = (formData.get("password") as string) || password;

    startTransition(async () => {
      setError("");
      try {
        const result = await signIn("credentials", {
          email: formEmail,
          password: formPassword,
          redirect: false,
        });
        if (result?.error) {
          setError("بيانات الدخول غير صحيحة. تأكد من البريد الإلكتروني وكلمة المرور.");
        } else {
          router.push("/");
          router.refresh();
        }
      } catch {
        setError("حدث خطأ — حاول لاحقاً");
      }
    });
  }

  return (
    <Card className="w-full overflow-hidden border-t-4 border-t-secondary-300">
      <CardHeader>
        <CardTitle className="text-center text-lg">تسجيل الدخول</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              name="password"
              type="password"
              dir="ltr"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isPending}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "جارٍ الدخول..." : "دخول"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}