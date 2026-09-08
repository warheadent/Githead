import { useMemo, type ReactNode } from "react";
import { FixedSizeVirtualList } from "./FixedSizeVirtualList";

export function MarkdownSource({ text, line, onLine }: { text: string; line: number; onLine: (line: number) => void }): ReactNode {
  const lines = useMemo(() => text.split(/\r?\n/).map((text, index) => ({ text, number: index + 1 })), [text]);
  return <div className="markdown-source" onKeyDown={(event) => {
    const next = event.key === "ArrowDown" ? Math.min(lines.length, line + 1) : event.key === "ArrowUp" ? Math.max(1, line - 1) : null;
    if (next !== null) { event.preventDefault(); onLine(next); }
  }}>
    <FixedSizeVirtualList items={lines} itemKey={(item) => String(item.number)} rowHeight={28}
      ariaLabel="Markdown source" selectedKey={String(line)} multiSelectable={false} className="markdown-source-list"
      renderItem={(item, index, props) => <div {...props} role="option" aria-selected={item.number === line}
        data-virtual-index={index} className="markdown-source-line selectable-text" onClick={() => onLine(item.number)}>
        <span className="markdown-source-number">{item.number}</span><code>{item.text || " "}</code>
      </div>} />
  </div>;
}
