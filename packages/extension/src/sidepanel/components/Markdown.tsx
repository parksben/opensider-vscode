import { Children, isValidElement, memo, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openAgentLink } from "../open-link";
import { MermaidBlock } from "./MermaidBlock";

function fenceLanguage(className?: string): string | undefined {
  const match = /language-([a-z0-9+-]+)/i.exec(className ?? "");
  return match?.[1]?.toLowerCase();
}

function codeText(node: ReactNode): string {
  if (!isValidElement<{ children?: ReactNode; className?: string }>(node)) return "";
  return String(node.props.children ?? "").replace(/\n$/, "");
}

export const Markdown = memo(
  function Markdown({ text }: { text: string }) {
    const onLink = (event: MouseEvent<HTMLAnchorElement>, href?: string) => {
      const target = (href ?? "").trim();
      if (!target) return;
      // The VS Code webview installs its own click listener on the content
      // window (handleInnerClick). When it also runs, it opens the target
      // through the workbench opener with `fromWorkspace: true`, which skips
      // the confirmation for trusted workspaces. The link then opened while the
      // extension host's confirmation dialog was still up, so "Cancel" could
      // not stop it. stopPropagation keeps only the host path, which shows
      // VS Code's dialog for external links.
      event.preventDefault();
      event.stopPropagation();
      openAgentLink(target);
    };

    return (
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a({ href, children }) {
              return (
                <a href={href} onClick={(event) => onLink(event, href)}>
                  {children}
                </a>
              );
            },
            table({ children }) {
              return (
                <div className="cs-md-table">
                  <table>{children}</table>
                </div>
              );
            },
            pre({ children }) {
              const code = Children.toArray(children).find((child) => isValidElement(child));
              if (
                isValidElement<{ className?: string }>(code) &&
                fenceLanguage(code.props.className) === "mermaid"
              ) {
                return <MermaidBlock source={codeText(code)} />;
              }
              return <pre>{children}</pre>;
            },
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) => prev.text === next.text,
);
