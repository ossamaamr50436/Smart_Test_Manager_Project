"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ChevronDown, LogOut, Menu, Settings, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { usePlatformSettings } from "@/components/providers/settings-provider";

export function DashboardTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { data: session } = useSession();
  const { settings } = usePlatformSettings();
  const user = session?.user;
  const role = (user?.role as RoleKey | undefined) ?? undefined;
  const roleLabel = role ? ROLE_LABELS[role] : "مستخدم";
  const displayName = user?.name?.trim() || "مستخدم";
  const avatarChar = displayName.charAt(0);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center border-b bg-gradient-to-r from-card via-card to-primary-50 px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="فتح القائمة"
        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary-200/40 md:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>
      <div className="ms-auto flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-secondary-200/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            )}
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback>{avatarChar}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-start">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{roleLabel}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound className="h-4 w-4" />
                الملف الشخصي
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                إعدادات المستخدم
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}