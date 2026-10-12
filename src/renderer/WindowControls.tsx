import { Copy, Maximize2, Minus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface WindowControlsProps {
  isMaximized: boolean;
  onMinimize(): void;
  onToggleMaximize(): void;
  onClose(): void;
}

export function WindowControls({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose
}: WindowControlsProps): ReactNode {
  const maximizeLabel = isMaximized ? "Restore window" : "Maximize window";
  const MaximizeIcon = isMaximized ? Copy : Maximize2;

  return (
    <div className="window-controls" aria-label="Window controls">
      <WindowControlButton label="Minimize window" onClick={onMinimize}>
        <Minus />
      </WindowControlButton>
      <WindowControlButton label={maximizeLabel} onClick={onToggleMaximize}>
        <MaximizeIcon />
      </WindowControlButton>
      <WindowControlButton label="Close window" destructive onClick={onClose}>
        <X />
      </WindowControlButton>
    </div>
  );
}

interface WindowControlButtonProps {
  children: ReactNode;
  destructive?: boolean;
  label: string;
  onClick(): void;
}

function WindowControlButton({
  children,
  destructive = false,
  label,
  onClick
}: WindowControlButtonProps): ReactNode {
  const [open, setOpen] = useState(false);

  const closeTooltip = (): void => {
    setOpen(false);
  };

  const handleClick = (): void => {
    closeTooltip();
    onClick();
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={destructive ? "window-control window-control-close" : "window-control"}
          aria-label={label}
          onBlur={closeTooltip}
          onClick={handleClick}
          onMouseLeave={closeTooltip}
          onPointerLeave={closeTooltip}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
