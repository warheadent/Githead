import { useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button, TooltipButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function MarkdownMediaViewer({ src, label, kind = "image" }: { src: string; label: string; kind?: "image" | "diagram" }): ReactNode {
  const canvas = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  return <Dialog onOpenChange={(open) => { if (open) setZoom(100); }}>
    <DialogTrigger asChild>
      <TooltipButton type="button" variant="outline" size="icon-sm" aria-label={`Expand ${kind}`} tooltip={`Expand ${kind}`}><Maximize2 /></TooltipButton>
    </DialogTrigger>
    <DialogContent className="markdown-media-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); canvas.current?.focus(); }}>
      <DialogTitle>{label || (kind === "diagram" ? "Mermaid diagram" : "Image")}</DialogTitle>
      <DialogDescription className="sr-only">Use the zoom controls to inspect the {kind}. Press Escape to close.</DialogDescription>
      <div className="markdown-media-zoom">
        <TooltipButton variant="outline" size="icon-sm" aria-label="Zoom out" tooltip="Zoom out" disabled={zoom <= 25} onClick={() => setZoom(Math.max(25, zoom - 25))}><Minus /></TooltipButton>
        <span role="status" aria-live="polite">{zoom}%</span>
        <TooltipButton variant="outline" size="icon-sm" aria-label="Zoom in" tooltip="Zoom in" disabled={zoom >= 400} onClick={() => setZoom(Math.min(400, zoom + 25))}><Plus /></TooltipButton>
        <Button variant="outline" size="sm" onClick={() => setZoom(100)}>Fit width</Button>
      </div>
      <div ref={canvas} className="markdown-media-canvas" tabIndex={0} aria-label={`${kind} viewport`}>
        <img src={src} alt={label} style={{ width: `${zoom}%` }} />
      </div>
    </DialogContent>
  </Dialog>;
}
