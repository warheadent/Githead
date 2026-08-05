import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoadingState({ label, className }: { label: string; className?: string }): ReactNode {
  return (
    <div
      className={cn("flex min-h-16 items-center justify-center p-4 text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
