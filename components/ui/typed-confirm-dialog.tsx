"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * حوار تأكيد الحذف — يتطلب كتابة الاسم الحرفي قبل تفعيل زر الحذف.
 * يُغلق تلقائياً عند نجاح onConfirm، ويُبقي على الخطأ ظاهراً عند الإخفاق.
 */
export function TypedConfirmDialog({
  triggerLabel,
  title,
  description,
  nameToType,
  confirmLabel = "حذف نهائياً",
  onConfirm,
  disabled = false,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  nameToType: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canConfirm = typed.trim() === nameToType;

  async function handleConfirm() {
    setError("");
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setTyped("");
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            لتأكيد الحذف، اكتب اسم الجهة بالضبط:{" "}
            <span className="font-medium text-foreground">{nameToType}</span>
          </p>
          <div className="space-y-1">
            <Label htmlFor="confirm-type">اسم الجهة</Label>
            <Input
              id="confirm-type"
              dir="rtl"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={nameToType}
              autoComplete="off"
            />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            إلغاء
          </Button>
          <Button variant="destructive" disabled={!canConfirm || busy} onClick={handleConfirm}>
            {busy ? "جارٍ الحذف..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}