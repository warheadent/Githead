import { Check, Copy } from "lucide-react";
import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TooltipButton } from "@/components/ui/button";
import { MermaidDiagram } from "./MermaidDiagram";
import { MotionPresence } from "./motion";

const COPY_FEEDBACK_DURATION_MS = 2_000;

type CopyStatus = "idle" | "copied" | "error";

const COPY_ICON_PRESENCE_CLASS = "grid place-items-center [--motion-scale:0.97] [--motion-reduced-opacity:0.85]";

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

function MarkdownCodeBlock({ children, node: _node, ...props }: ComponentProps<"pre"> & ExtraProps): ReactNode {
  if (
    isValidElement<{ className?: string; children?: ReactNode }>(children)
    && /(?:^|\s)language-mermaid(?:\s|$)/i.test(children.props.className ?? "")
  ) {
    const definition = getNodeText(children).replace(/\n$/, "");
    return (
      <MermaidDiagram
        definition={definition}
        fallback={<MarkdownCopyableCodeBlock {...props}>{children}</MarkdownCopyableCodeBlock>}
      />
    );
  }

  return <MarkdownCopyableCodeBlock {...props}>{children}</MarkdownCopyableCodeBlock>;
}

function MarkdownCopyableCodeBlock({ children, ...props }: ComponentProps<"pre">): ReactNode {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyGeneration = useRef(0);
  const code = getNodeText(children);

  useEffect(() => () => {
    copyGeneration.current += 1;
    if (feedbackTimer.current !== null) {
      clearTimeout(feedbackTimer.current);
    }
  }, []);

  const copyCode = async (): Promise<void> => {
    const generation = copyGeneration.current + 1;
    copyGeneration.current = generation;
    if (feedbackTimer.current !== null) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }

    try {
      await window.githead.copyTextToClipboard({ text: code });
      if (generation !== copyGeneration.current) return;
      setStatus("copied");
    } catch {
      if (generation !== copyGeneration.current) return;
      setStatus("error");
    }

    feedbackTimer.current = setTimeout(() => {
      if (generation === copyGeneration.current) {
        setStatus("idle");
        feedbackTimer.current = null;
      }
    }, COPY_FEEDBACK_DURATION_MS);
  };

  const label = status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy code";

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-copy">
        <TooltipButton
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={label}
          tooltip={label}
          onClick={() => void copyCode()}
        >
          <span
            aria-hidden="true"
            className="grid size-4 [&>.motion-presence]:col-start-1 [&>.motion-presence]:row-start-1"
          >
            <MotionPresence
              present={status !== "copied"}
              className={COPY_ICON_PRESENCE_CLASS}
              presenceKey="copy"
            >
              <Copy />
            </MotionPresence>
            <MotionPresence
              present={status === "copied"}
              className={COPY_ICON_PRESENCE_CLASS}
              presenceKey="check"
            >
              <Check />
            </MotionPresence>
          </span>
        </TooltipButton>
      </div>
      <pre {...props}>{children}</pre>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status === "copied" ? "Code copied" : status === "error" ? "Copy failed" : ""}
      </span>
    </div>
  );
}

function MarkdownTable({ node: _node, ...props }: ComponentProps<"table"> & ExtraProps): ReactNode {
  return (
    <div className="markdown-preview-table">
      <table {...props} />
    </div>
  );
}

export function MarkdownPreview({ text }: { text: string }): ReactNode {
  return (
    <article className="markdown-preview selectable-text">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: MarkdownCodeBlock,
          table: MarkdownTable
        }}
      >
        {text}
      </ReactMarkdown>
    </article>
  );
}
