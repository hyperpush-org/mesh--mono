import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StackFrame {
  filename?: string;
  lineno?: number;
  colno?: number;
  function?: string;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
}

interface StackTraceProps {
  stacktrace: unknown;
}

function parseFrames(raw: unknown): StackFrame[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as StackFrame[];
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.frames)) return obj.frames as StackFrame[];
    if (Array.isArray(obj.stacktrace)) return obj.stacktrace as StackFrame[];
  }
  return [];
}

export function StackTrace({ stacktrace }: StackTraceProps) {
  const frames = parseFrames(stacktrace);

  if (frames.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No stack trace available
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {frames.map((frame, i) => (
        <StackFrameRow
          key={i}
          frame={frame}
          defaultExpanded={i === 0}
          isLast={i === frames.length - 1}
        />
      ))}
    </div>
  );
}

function StackFrameRow({
  frame,
  defaultExpanded,
  isLast,
}: {
  frame: StackFrame;
  defaultExpanded: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasContext =
    frame.context_line || frame.pre_context?.length || frame.post_context?.length;
  const fnName = frame.function || "<anonymous>";
  const location = frame.filename
    ? `${frame.filename}${frame.lineno != null ? `:${frame.lineno}` : ""}${frame.colno != null ? `:${frame.colno}` : ""}`
    : "";

  return (
    <div className={cn(!isLast && "border-b border-border")}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
        <span className="font-mono text-sm font-semibold truncate">
          {fnName}
        </span>
        {location && (
          <span className="font-mono text-xs text-muted-foreground truncate ml-auto">
            {location}
          </span>
        )}
      </button>
      {expanded && hasContext && (
        <div className="bg-muted px-3 py-2 overflow-x-auto">
          <pre className="font-mono text-xs leading-5">
            {frame.pre_context?.map((line, j) => {
              const lineNum =
                frame.lineno != null
                  ? frame.lineno - (frame.pre_context!.length - j)
                  : null;
              return (
                <div key={`pre-${j}`} className="text-muted-foreground">
                  {lineNum != null && (
                    <span className="inline-block w-10 text-right mr-3 select-none text-muted-foreground/60">
                      {lineNum}
                    </span>
                  )}
                  {line}
                </div>
              );
            })}
            {frame.context_line != null && (
              <div className="bg-primary/10 -mx-3 px-3 text-foreground font-medium">
                {frame.lineno != null && (
                  <span className="inline-block w-10 text-right mr-3 select-none text-primary/60">
                    {frame.lineno}
                  </span>
                )}
                {frame.context_line}
              </div>
            )}
            {frame.post_context?.map((line, j) => {
              const lineNum =
                frame.lineno != null ? frame.lineno + j + 1 : null;
              return (
                <div key={`post-${j}`} className="text-muted-foreground">
                  {lineNum != null && (
                    <span className="inline-block w-10 text-right mr-3 select-none text-muted-foreground/60">
                      {lineNum}
                    </span>
                  )}
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}
