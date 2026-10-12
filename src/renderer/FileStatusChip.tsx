import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { TooltipTarget } from "@/components/ui/tooltip";
import { getFileStatusLetter, type FileStatusVisuals } from "./fileStatusVisuals";

export function FileStatusChip({ visuals, tooltip = true }: { visuals: FileStatusVisuals; tooltip?: boolean }): ReactNode {
  const chip = (
    <Badge
      className={`status-chip status-chip-${visuals.tone}`}
      data-status-tone={visuals.tone}
      aria-label={visuals.label}
      title={tooltip ? undefined : visuals.label}
    >
      <span aria-hidden="true">{getFileStatusLetter(visuals)}</span>
    </Badge>
  );

  return tooltip ? <TooltipTarget content={visuals.label}>{chip}</TooltipTarget> : chip;
}
