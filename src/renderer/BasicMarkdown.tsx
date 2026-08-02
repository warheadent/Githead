import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

export function BasicMarkdown({ children, externalLinks = false }: { children: string; externalLinks?: boolean }): ReactNode {
  return (
    <ReactMarkdown
      skipHtml
      components={externalLinks ? {
        a: ({ children: linkChildren, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer">{linkChildren}</a>
        )
      } : undefined}
    >
      {children}
    </ReactMarkdown>
  );
}
