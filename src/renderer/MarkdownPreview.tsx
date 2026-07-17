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

const COPY_FEEDBACK_DURATION_MS = 2_000;

type CopyStatus = "idle" | "copied" | "error";

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

function MarkdownCodeBlock({ children, ...props }: ComponentProps<"pre">): ReactNode {
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
          {status === "copied" ? <Check /> : <Copy />}
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
    <div className="markdown-preview-table" role="region" aria-label="Scrollable Markdown table" tabIndex={0}>
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
