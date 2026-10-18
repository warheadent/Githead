import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GitDiffSide } from "../shared/types";
import { LoadingState } from "./LoadingState";
import { createLinePatch, type DiffRow, type DiffRowGroup } from "./diffParser";
import { createDiffProcessingSession, type ProcessedDiff } from "./diffProcessingClient";
import { DIFF_ROW_GUTTER_PX, planDiffRender, type DiffRenderChunk, type DiffRenderPlan } from "./diffRenderPlan";
import type { HighlightedCode } from "./syntaxHighlighter";
import { selectionIntersectsElement, useSelectionSafeValue } from "./useSelectionSafeValue";

export interface DiffHunkAction {
  onDiscard?: ((patch: string) => void) | undefined;
  side: GitDiffSide;
  disabled: boolean;
  onApply: (patch: string) => void;
}

/** Rows that mount with the processed diff, enough to fill a tall viewport. */
const INITIAL_MOUNT_ROWS = 256;
/** Script time that one background mount step aims for, so each frame stays well under 50 ms. */
const MOUNT_STEP_TARGET_MS = 8;
const MIN_MOUNT_STEP_ROWS = 64;
const MAX_MOUNT_STEP_ROWS = 2048;

type DiffActionVerb = "Stage" | "Unstage";

interface MountProgress {
  plan: DiffRenderPlan | null;
  /** 1 for each chunk that renders its rows. Other chunks are sized placeholders. */
  mounted: Uint8Array;
  pending: number;
}

function createMountProgress(plan: DiffRenderPlan | null, priority: ReadonlySet<number>): MountProgress {
  if (!plan) return { plan, mounted: new Uint8Array(0), pending: 0 };
  return mountChunks({ plan, mounted: new Uint8Array(plan.chunks.length), pending: plan.chunks.length }, INITIAL_MOUNT_ROWS, priority);
}

/** Mounts the priority chunks, then the first pending chunks in display order up to the row budget. */
function mountChunks(progress: MountProgress, rowBudget: number, priority: ReadonlySet<number>): MountProgress {
  const { plan } = progress;
  if (!plan || progress.pending === 0) return progress;
  const mounted = progress.mounted.slice();
  let pending = progress.pending;
  let rows = 0;
  const mount = (index: number): void => {
    if (mounted[index] !== 0) return;
    mounted[index] = 1;
    pending -= 1;
    rows += plan.chunks[index]?.rowCount ?? 0;
  };
  for (const index of priority) {
    if (index >= 0 && index < mounted.length) mount(index);
  }
  for (let index = 0; index < mounted.length && rows < rowBudget; index += 1) mount(index);
  return { plan, mounted, pending };
}

function mountAllChunks(progress: MountProgress): MountProgress {
  return progress.pending === 0 ? progress : { plan: progress.plan, mounted: progress.mounted.slice().fill(1), pending: 0 };
}

function countMountedRows(previous: MountProgress, next: MountProgress): number {
  let rows = 0;
  next.mounted.forEach((value, index) => {
    if (value !== 0 && previous.mounted[index] === 0) rows += next.plan?.chunks[index]?.rowCount ?? 0;
  });
  return rows;
}

/** Runs the callback after the next frame is presented, so each mount step gets its own frame. */
function scheduleAfterNextFrame(callback: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (typeof requestAnimationFrame !== "function") {
    timer = setTimeout(callback, 16);
    return () => clearTimeout(timer!);
  }
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(callback, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
  };
}

function findScrollContainer(element: HTMLElement): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflowY = view?.getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return parent;
  }
  return null;
}

/**
 * Renders a text diff in chunks of rows. The first rows mount with the processed diff and the rest
 * mount over the following frames, nearest the viewport first, so no frame pays for the whole diff.
 * Every chunk ends up in the DOM, which keeps text selection, copy, and find across the whole diff.
 * Off-screen chunks use content-visibility, so the browser skips their layout and paint.
 */
export const DiffRows = memo(function DiffRows({
  filePath,
  text,
  truncated,
  hunkAction
}: {
  filePath: string;
  text: string;
  truncated: boolean;
  hunkAction?: DiffHunkAction | undefined;
}): ReactNode {
  const [discardTarget, setDiscardTarget] = useState<{ patch: string; filePath: string; text: string } | null>(null);
  const discardTargetCurrent = discardTarget?.filePath === filePath && discardTarget.text === text;
  const sessionRef = useRef<ReturnType<typeof createDiffProcessingSession> | null>(null);
  const {
    value: processedValue,
    requestValue: requestProcessedValue,
    rootRef,
    onPointerDownCapture
  } = useSelectionSafeValue<{
    filePath: string;
    text: string;
    truncated: boolean;
    result: ProcessedDiff;
  } | null>(null);

  useEffect(() => {
    const session = createDiffProcessingSession();
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    let cancelled = false;

    void session.process({ filePath, text, truncated }).then((result) => {
      if (!cancelled && result) requestProcessedValue({ filePath, text, truncated, result });
    });

    return () => {
      cancelled = true;
      session.cancel();
    };
  }, [filePath, requestProcessedValue, text, truncated]);

  const processed = processedValue?.filePath === filePath
    && processedValue.text === text
    && processedValue.truncated === truncated
    ? processedValue.result
    : null;
  const plan = useMemo(() => processed ? planDiffRender(processed.groups) : null, [processed]);

  // Chunks near the viewport, from the IntersectionObserver. A new plan mounts them first.
  const nearViewportRef = useRef(new Set<number>());
  const [storedProgress, setProgress] = useState<MountProgress>(() => createMountProgress(plan, nearViewportRef.current));
  let progress = storedProgress;
  if (storedProgress.plan !== plan) {
    progress = createMountProgress(plan, nearViewportRef.current);
    setProgress(progress);
  }
  const stepRowsRef = useRef(INITIAL_MOUNT_ROWS);

  useEffect(() => {
    if (!plan || progress.plan !== plan || progress.pending === 0) return;
    return scheduleAfterNextFrame(() => {
      const next = mountChunks(progress, stepRowsRef.current, nearViewportRef.current);
      const started = performance.now();
      flushSync(() => setProgress(next));
      const elapsed = performance.now() - started;
      const rows = countMountedRows(progress, next);
      if (rows > 0 && elapsed > 0) {
        const fitted = (rows * MOUNT_STEP_TARGET_MS) / elapsed;
        stepRowsRef.current = Math.round(Math.min(MAX_MOUNT_STEP_ROWS, Math.max(MIN_MOUNT_STEP_ROWS, (stepRowsRef.current + fitted) / 2)));
      }
    });
  }, [plan, progress]);

  // Copying a selection that reaches pending chunks mounts them first, so the copy has every row.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || progress.pending === 0) return;
    const ownerDocument = root.ownerDocument;
    const handleCopy = (): void => {
      if (!selectionIntersectsElement(ownerDocument.getSelection(), root)) return;
      flushSync(() => setProgress(mountAllChunks(progress)));
    };
    ownerDocument.addEventListener("copy", handleCopy, true);
    return () => ownerDocument.removeEventListener("copy", handleCopy, true);
  }, [progress, rootRef]);

  useEffect(() => {
    const root = rootRef.current;
    const nearViewport = nearViewportRef.current;
    if (!plan || !root || typeof IntersectionObserver !== "function") return;
    nearViewport.clear();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.diffChunk);
        if (!Number.isInteger(index)) continue;
        if (entry.isIntersecting) nearViewport.add(index);
        else nearViewport.delete(index);
      }
    }, { root: findScrollContainer(root), rootMargin: "100% 0px" });
    for (const chunk of root.querySelectorAll("[data-diff-chunk]")) observer.observe(chunk);
    return () => observer.disconnect();
  }, [plan, rootRef]);

  // Rows read the action through refs, so a background refresh that toggles `disabled` re-renders
  // only the hunk toolbars. The fieldset disables every line action at once.
  const hunkActionRef = useRef(hunkAction);
  useLayoutEffect(() => {
    hunkActionRef.current = hunkAction;
  });
  const applyHunk = useCallback((patch: string): void => {
    const action = hunkActionRef.current;
    if (action && !action.disabled) action.onApply(patch);
  }, []);
  const applyLine = useCallback((group: DiffRowGroup, rowIndex: number): void => {
    const action = hunkActionRef.current;
    if (!action || action.disabled) return;
    const patch = createLinePatch(group, rowIndex, action.side);
    if (patch) action.onApply(patch);
  }, []);
  const requestDiscard = useCallback((patch: string): void => {
    setDiscardTarget({ patch, filePath, text });
  }, [filePath, text]);

  const actionVerb: DiffActionVerb | null = hunkAction ? (hunkAction.side === "unstaged" ? "Stage" : "Unstage") : null;
  const actionsDisabled = Boolean(hunkAction?.disabled);
  const canDiscard = Boolean(hunkAction?.onDiscard);

  return (
    <div className="diff-rows" ref={rootRef} aria-busy={!processed || progress.pending > 0} onPointerDownCapture={onPointerDownCapture}>
      {!processed ? <LoadingState label="Processing diff" className="min-h-32" /> : null}
      <Dialog open={Boolean(discardTarget && discardTargetCurrent && hunkAction?.onDiscard)} onOpenChange={(open) => { if (!open) setDiscardTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this hunk?</DialogTitle>
            <DialogDescription>The changes in this hunk will be discarded. Other hunks and staged changes will be kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={hunkAction?.disabled || !discardTargetCurrent} onClick={() => {
              if (discardTarget && discardTargetCurrent && !hunkAction?.disabled) hunkAction?.onDiscard?.(discardTarget.patch);
              setDiscardTarget(null);
            }}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {processed && plan ? (
        <fieldset className="diff-rows-content" role="presentation" disabled={actionsDisabled}>
          {plan.chunks.map((chunk) => (
            <DiffRowChunk
              key={chunk.index}
              chunk={chunk}
              groups={processed.groups}
              highlightedRows={processed.highlightedRows}
              mounted={progress.mounted[chunk.index] !== 0}
              actionVerb={actionVerb}
              actionsDisabled={actionsDisabled}
              canDiscard={canDiscard}
              onApplyHunk={applyHunk}
              onRequestDiscard={requestDiscard}
              onApplyLine={applyLine}
            />
          ))}
        </fieldset>
      ) : null}
    </div>
  );
});

interface DiffRowActionProps {
  actionVerb: DiffActionVerb | null;
  onApplyLine: (group: DiffRowGroup, rowIndex: number) => void;
}

const DiffRowChunk = memo(function DiffRowChunk({
  chunk,
  groups,
  highlightedRows,
  mounted,
  actionVerb,
  actionsDisabled,
  canDiscard,
  onApplyHunk,
  onRequestDiscard,
  onApplyLine
}: DiffRowActionProps & {
  chunk: DiffRenderChunk;
  groups: readonly DiffRowGroup[];
  highlightedRows: readonly (readonly HighlightedCode[])[];
  mounted: boolean;
  actionsDisabled: boolean;
  canDiscard: boolean;
  onApplyHunk: (patch: string) => void;
  onRequestDiscard: (patch: string) => void;
}): ReactNode {
  const style = {
    "--diff-chunk-width": `calc(${DIFF_ROW_GUTTER_PX}px + ${chunk.columns}ch)`,
    "--diff-chunk-height": `${chunk.estimatedHeight}px`
  } as CSSProperties;

  return (
    <div className="diff-chunk" data-diff-chunk={chunk.index} data-pending={mounted ? undefined : ""} style={style}>
      {mounted ? chunk.pieces.map((piece) => {
        const group = groups[piece.groupIndex];
        if (!group) return null;
        const rows = piece.rowIndexes.map((rowIndex) => {
          const row = group.rows[rowIndex]!;
          return (
            <DiffRowView
              key={`${rowIndex}:${row.kind}:${row.oldLine ?? ""}:${row.newLine ?? ""}`}
              group={group}
              row={row}
              rowIndex={rowIndex}
              highlighted={highlightedRows[piece.groupIndex]?.[rowIndex]}
              actionVerb={actionVerb}
              onApplyLine={onApplyLine}
            />
          );
        });

        if (group.kind !== "hunk") return <Fragment key={piece.groupIndex}>{rows}</Fragment>;
        return (
          <div className="diff-hunk-block" key={piece.groupIndex}>
            {piece.startsHunk ? (
              <DiffHunkToolbar
                header={group.rows[0]?.text ?? ""}
                patch={group.patch}
                actionVerb={actionVerb}
                disabled={actionsDisabled}
                canDiscard={canDiscard}
                onApply={onApplyHunk}
                onRequestDiscard={onRequestDiscard}
              />
            ) : null}
            {rows}
          </div>
        );
      }) : null}
    </div>
  );
});

const DiffHunkToolbar = memo(function DiffHunkToolbar({
  header,
  patch,
  actionVerb,
  disabled,
  canDiscard,
  onApply,
  onRequestDiscard
}: {
  header: string;
  patch: string | null;
  actionVerb: DiffActionVerb | null;
  disabled: boolean;
  canDiscard: boolean;
  onApply: (patch: string) => void;
  onRequestDiscard: (patch: string) => void;
}): ReactNode {
  const label = actionVerb === "Stage" ? "Stage hunk" : "Unstage hunk";
  return (
    <div className="diff-hunk-toolbar">
      <span className="diff-hunk-header">{header}</span>
      <span className="diff-hunk-actions">
        {canDiscard && patch ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="diff-hunk-action"
            disabled={disabled}
            onClick={() => onRequestDiscard(patch)}
          >
            Discard hunk
          </Button>
        ) : null}
        {actionVerb && patch ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="diff-hunk-action"
            aria-label={label}
            disabled={disabled}
            onClick={() => onApply(patch)}
          >
            {label}
          </Button>
        ) : null}
      </span>
    </div>
  );
});

function diffLineActionLabel(row: DiffRow, verb: DiffActionVerb): string {
  const lineNumber = row.newLine ?? row.oldLine;
  const changeKind = row.kind === "add" ? "added" : "deleted";
  return Number.isInteger(lineNumber) ? `${verb} ${changeKind} line ${lineNumber}` : `${verb} ${changeKind} line`;
}

const DiffRowView = memo(function DiffRowView({
  group,
  row,
  rowIndex,
  highlighted,
  actionVerb,
  onApplyLine
}: DiffRowActionProps & {
  group: DiffRowGroup;
  row: DiffRow;
  rowIndex: number;
  highlighted: HighlightedCode | undefined;
}): ReactNode {
  const label = actionVerb && (row.kind === "add" || row.kind === "delete") ? diffLineActionLabel(row, actionVerb) : null;
  return (
    <div className={`diff-row ${row.kind}`}>
      <span className="diff-line-number old-line">{row.oldLine === null ? "" : row.oldLine}</span>
      <span className="diff-line-number new-line">{row.newLine === null ? "" : row.newLine}</span>
      {label ? (
        <button
          type="button"
          className="diff-marker diff-line-action"
          aria-label={label}
          title={label}
          onClick={() => onApplyLine(group, rowIndex)}
        >
          {row.marker}
        </button>
      ) : <span className="diff-marker">{row.marker}</span>}
      <DiffCode highlighted={highlighted} text={row.text} />
    </div>
  );
});

function DiffCode({ highlighted, text }: { highlighted: HighlightedCode | undefined; text: string }): ReactNode {
  if (highlighted?.kind === "highlighted") {
    return <span className="diff-code hljs" dangerouslySetInnerHTML={{ __html: highlighted.value }} />;
  }

  return <span className="diff-code">{highlighted?.value ?? text}</span>;
}
