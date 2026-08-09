import {
  AnimatePresence,
  motion,
  useIsPresent,
  type HTMLMotionProps,
  type Transition
} from "motion/react";
import { type Key, type ReactNode } from "react";

const DEFAULT_DURATION_SECONDS = 0.12;
const DEFAULT_TRANSITION: Transition = {
  duration: DEFAULT_DURATION_SECONDS,
  ease: "easeOut"
};

type MotionElement = "article" | "div" | "section";

interface MotionPresenceProps {
  present: boolean;
  children: ReactNode;
  className: string;
  element?: MotionElement;
  id?: string;
  ariaLabel?: string;
  presenceKey?: Key;
  enterDuration?: number;
  exitDuration?: number;
  initialOpacity?: number;
  initialY?: number;
  initialScale?: number;
  initial?: boolean;
  onExitComplete?: () => void;
}

interface PresenceItemProps extends Omit<MotionPresenceProps, "present" | "presenceKey" | "onExitComplete"> {
  layout?: boolean | "position" | "size" | "preserve-aspect";
  layoutDependency?: unknown;
  onExitAnimationComplete?: () => void;
}

function PresenceItem({
  children,
  className,
  element = "div",
  id,
  ariaLabel,
  enterDuration = 120,
  exitDuration = 120,
  initialOpacity = 0,
  initialY = 0,
  initialScale = 1,
  layout,
  layoutDependency,
  onExitAnimationComplete
}: PresenceItemProps): ReactNode {
  const isPresent = useIsPresent();
  const hidden = {
    opacity: initialOpacity,
    y: initialY,
    scale: initialScale
  };
  const transition: Transition = {
    ...DEFAULT_TRANSITION,
    duration: (isPresent ? enterDuration : exitDuration) / 1_000,
    layout: DEFAULT_TRANSITION
  };
  const props = {
    ...(id ? { id } : {}),
    ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
    className: `motion-presence ${className}`,
    "data-motion-state": isPresent ? "entered" : "exiting",
    "aria-hidden": isPresent ? undefined : true,
    inert: isPresent ? undefined : true,
    initial: hidden,
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: hidden,
    transition,
    layout,
    layoutDependency,
    onAnimationComplete: () => {
      if (!isPresent) {
        onExitAnimationComplete?.();
      }
    },
    children
  };

  if (element === "article") {
    return <motion.article {...props as HTMLMotionProps<"article">} />;
  }
  if (element === "section") {
    return <motion.section {...props as HTMLMotionProps<"section">} />;
  }
  return <motion.div {...props as HTMLMotionProps<"div">} />;
}

/** Keeps exiting content mounted and delegates animation lifecycle to Motion. */
export function MotionPresence({
  present,
  presenceKey = "presence",
  initial = true,
  onExitComplete,
  ...props
}: MotionPresenceProps): ReactNode {
  return (
    <AnimatePresence initial={initial} {...(onExitComplete ? { onExitComplete } : {})}>
      {present ? <PresenceItem key={presenceKey} {...props} /> : null}
    </AnimatePresence>
  );
}

interface MotionSwapItem {
  key: Key;
  content: ReactNode;
}

interface MotionSwapProps {
  item: MotionSwapItem | null;
  className: string;
  presenceClassName: string;
  exitDuration?: number;
  initialOpacity?: number;
  initialY?: number;
  initialScale?: number;
}

function SwapItem({ item, presenceClassName, exitDuration, initialOpacity, initialY, initialScale }: {
  item: MotionSwapItem;
  presenceClassName: string;
  exitDuration: number;
  initialOpacity?: number;
  initialY?: number;
  initialScale?: number;
}): ReactNode {
  const isPresent = useIsPresent();
  return (
    <PresenceItem
      className={`${presenceClassName}${isPresent ? "" : " motion-swap-outgoing"}`}
      exitDuration={exitDuration}
      {...(initialOpacity === undefined ? {} : { initialOpacity })}
      {...(initialY === undefined ? {} : { initialY })}
      {...(initialScale === undefined ? {} : { initialScale })}
    >
      {item.content}
    </PresenceItem>
  );
}

/** Cross-fades keyed content while exposing only the newest live-region node. */
export function MotionSwap({
  item,
  className,
  presenceClassName,
  exitDuration = 120,
  initialOpacity,
  initialY,
  initialScale
}: MotionSwapProps): ReactNode {
  return (
    <div className={className}>
      <AnimatePresence initial mode="sync">
        {item ? (
          <SwapItem
            key={item.key}
            item={item}
            presenceClassName={presenceClassName}
            exitDuration={exitDuration}
            {...(initialOpacity === undefined ? {} : { initialOpacity })}
            {...(initialY === undefined ? {} : { initialY })}
            {...(initialScale === undefined ? {} : { initialScale })}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export interface MotionListItem {
  key: string;
  content: ReactNode;
}

interface MotionListProps {
  items: readonly MotionListItem[];
  itemClassName: string;
  element?: MotionElement;
  exitDuration?: number;
  initialOpacity?: number;
  initialY?: number;
  initialScale?: number;
  onItemExitComplete?: (key: string) => void;
}

function MotionListRow({
  item,
  itemClassName,
  element,
  exitDuration,
  initialOpacity,
  initialY,
  initialScale,
  layoutDependency,
  onItemExitComplete
}: {
  item: MotionListItem;
  itemClassName: string;
  element: MotionElement;
  exitDuration: number;
  initialOpacity?: number;
  initialY?: number;
  initialScale?: number;
  layoutDependency: string;
  onItemExitComplete?: (key: string) => void;
}): ReactNode {
  return (
    <PresenceItem
      className={itemClassName}
      element={element}
      exitDuration={exitDuration}
      {...(initialOpacity === undefined ? {} : { initialOpacity })}
      {...(initialY === undefined ? {} : { initialY })}
      {...(initialScale === undefined ? {} : { initialScale })}
      layout="position"
      layoutDependency={layoutDependency}
      onExitAnimationComplete={() => onItemExitComplete?.(item.key)}
    >
      {item.content}
    </PresenceItem>
  );
}

/** Uses Motion presence and layout projection for list exits and reordering. */
export function MotionList({
  items,
  itemClassName,
  element = "div",
  exitDuration = 120,
  initialOpacity,
  initialY,
  initialScale,
  onItemExitComplete
}: MotionListProps): ReactNode {
  const layoutDependency = items.map((item) => item.key).join("\u0000");
  return (
    <AnimatePresence initial={false} mode="sync">
      {items.map((item) => (
        <MotionListRow
          key={item.key}
          item={item}
          itemClassName={itemClassName}
          element={element}
          exitDuration={exitDuration}
          {...(initialOpacity === undefined ? {} : { initialOpacity })}
          {...(initialY === undefined ? {} : { initialY })}
          {...(initialScale === undefined ? {} : { initialScale })}
          layoutDependency={layoutDependency}
          {...(onItemExitComplete ? { onItemExitComplete } : {})}
        />
      ))}
    </AnimatePresence>
  );
}
