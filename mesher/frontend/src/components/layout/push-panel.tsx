import type { ReactNode } from "react";

interface PushPanelLayoutProps {
  children: ReactNode;
  panel: ReactNode | null;
  panelWidth?: string;
}

export function PushPanelLayout({
  children,
  panel,
  panelWidth = "w-[480px]",
}: PushPanelLayoutProps) {
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-auto transition-all duration-200">
        {children}
      </div>
      {panel && (
        <div
          className={`${panelWidth} border-l border-border overflow-auto shrink-0 transition-all duration-200`}
        >
          {panel}
        </div>
      )}
    </div>
  );
}
