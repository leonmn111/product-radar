import { CopyButton } from "./copy-button";

export function CodeBlock({ title, code, copy = true }: { title: string; code: string; copy?: boolean }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
      <figcaption className="flex items-center justify-between gap-3 border-b border-zinc-800 py-1.5 pl-4 pr-2">
        <span className="truncate text-xs font-medium text-zinc-400">{title}</span>
        {copy && <CopyButton text={code} label={title} />}
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-zinc-200">
        <code className="font-mono">{code}</code>
      </pre>
    </figure>
  );
}
