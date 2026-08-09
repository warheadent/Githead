import {
  ArrowRightLeft,
  CirclePlus,
  CircleQuestionMark,
  Copy,
  FileQuestion,
  Package,
  Pencil,
  Trash2,
  TriangleAlert,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TooltipTarget } from "@/components/ui/tooltip";
import type { FileStatusVisuals } from "./fileStatusVisuals";

export function FileStatusChip({ visuals, tooltip = true }: { visuals: FileStatusVisuals; tooltip?: boolean }): ReactNode {
  const Icon = getFileStatusIcon(visuals);
  const chip = (
    <Badge
      className={`status-chip status-chip-${visuals.tone}`}
      data-status-tone={visuals.tone}
      aria-label={visuals.label}
      title={tooltip ? undefined : visuals.label}
    >
      <Icon aria-hidden="true" />
    </Badge>
  );

  return tooltip ? <TooltipTarget content={visuals.label}>{chip}</TooltipTarget> : chip;
}

function getFileStatusIcon(visuals: FileStatusVisuals): LucideIcon {
  if (visuals.code === "SM") return Package;

  switch (visuals.tone) {
    case "added":
      return CirclePlus;
    case "untracked":
      return CircleQuestionMark;
    case "modified":
      return Pencil;
    case "deleted":
      return Trash2;
    case "renamed":
      return ArrowRightLeft;
    case "copied":
      return Copy;
    case "conflict":
      return TriangleAlert;
    case "neutral":
      return FileQuestion;
  }
}
