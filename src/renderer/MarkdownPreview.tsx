import { Check, Copy, WrapText } from "lucide-react";
import {
  isValidElement,
  useContext,
  useId,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveMarkdownLink } from "@/shared/markdownLinks";
import { MarkdownContext, type MarkdownRepository } from "./markdownContext";
import { MarkdownImage } from "./MarkdownImage";
import { remarkAlerts, rehypeMarkdownNavigation, type MarkdownHeading } from "./markdownTransforms";
import { highlightMarkdownCode } from "./syntaxHighlighter";
import { TooltipButton } from "@/components/ui/button";
import { MermaidDiagram } from "./MermaidDiagram";
import { MotionPresence } from "./motion";

const COPY_FEEDBACK_DURATION_MS = 2_000;

type CopyStatus = "idle" | "copied" | "error";

const COPY_ICON_PRESENCE_CLASS = "grid place-items-center";

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
  const [wrap, setWrap] = useState(false);
  const language = isValidElement<{ className?: string }>(children)
    ? /(?:^|\s)language-([^\s]+)/.exec(children.props.className ?? "")?.[1] ?? "" : "";
  const highlighted = useMemo(() => highlightMarkdownCode(language, code), [language, code]);

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
    <div className={`markdown-code-block${wrap ? " is-wrapped" : ""}`}>
      <span className="markdown-code-language">{language || "text"}</span>
      <div className="markdown-code-copy">
        <TooltipButton type="button" variant="outline" size="icon-sm" aria-label="Wrap code" aria-pressed={wrap}
          tooltip={wrap ? "Scroll code horizontally" : "Wrap code"} onClick={() => setWrap(!wrap)}><WrapText /></TooltipButton>
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
              initialScale={0.97}
              presenceKey="copy"
            >
              <Copy />
            </MotionPresence>
            <MotionPresence
              present={status === "copied"}
              className={COPY_ICON_PRESENCE_CLASS}
              initialScale={0.97}
              presenceKey="check"
            >
              <Check />
            </MotionPresence>
          </span>
        </TooltipButton>
      </div>
      <pre {...props}><code>{highlighted.map((line, index) => <span key={index}>{index > 0 ? "\n" : ""}{line.kind === "highlighted"
        ? <span dangerouslySetInnerHTML={{ __html: line.value }} /> : line.value}</span>)}</code></pre>
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

function MarkdownLink({ children, href = "", node: _node, ...props }: ComponentProps<"a"> & ExtraProps): ReactNode {
  const { repository, onAnchor } = useContext(MarkdownContext);
  const link = resolveMarkdownLink(repository?.path ?? "", href);
  return <a {...props} href={href} target={link.kind === "external" ? "_blank" : undefined} rel="noreferrer"
    onClick={(event) => {
      if (link.kind === "external") return;
      event.preventDefault();
      if (link.kind !== "repository") return;
      if (href.startsWith("#") || link.path === repository?.path) onAnchor(link.fragment);
      else repository?.onNavigate(link.path, link.fragment);
    }}>{children}</a>;
}

const components = { a: MarkdownLink, img: MarkdownImage, pre: MarkdownCodeBlock, table: MarkdownTable };

export function MarkdownPreview({ text, repository, onHeadings, fragment = "" }: {
  text: string;
  repository?: MarkdownRepository | undefined;
  onHeadings?: ((headings: MarkdownHeading[]) => void) | undefined;
  fragment?: string;
}): ReactNode {
  const article = useRef<HTMLElement>(null);
  const id = useId();
  const navigation = useMemo(() => ({ prefix: `markdown-${id}-`, headings: [] as MarkdownHeading[] }), [id, text]);
  const context = useMemo(() => ({ repository, onAnchor: (target: string) => {
    const heading = Array.from(article.current?.querySelectorAll<HTMLElement>("[data-heading-id]") ?? [])
      .find((element) => element.dataset.headingId === target);
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  } }), [repository]);
  useEffect(() => { onHeadings?.([...navigation.headings]); }, [navigation, onHeadings]);
  useEffect(() => { if (fragment) context.onAnchor(fragment); }, [fragment, text, context]);
  return <MarkdownContext.Provider value={context}>
    <article ref={article} className="markdown-preview selectable-text">
      <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkAlerts]}
        rehypePlugins={[[rehypeMarkdownNavigation, navigation]]} components={components}>
        {text}
      </ReactMarkdown>
    </article>
  </MarkdownContext.Provider>;
}
