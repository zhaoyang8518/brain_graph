import React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectInfo } from "../../projects";

interface HeaderProps {
  selectedProject?: ProjectInfo;
  status: string;
  t: (key: string) => string;
  isDark: boolean;
  toggleTheme: () => void;
}

export function Header({
  selectedProject,
  status,
  t,
  isDark,
  toggleTheme
}: HeaderProps) {
  return (
    <header data-panel="workspace-header" className="h-16 flex items-center justify-between px-8 border-b bg-background/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex flex-col">
        <h1 className="text-sm font-semibold">{selectedProject?.name || "No Project Selected"}</h1>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{status || t("ready")}</p>
      </div>

      <div className="flex items-center gap-4">
        <Button data-action="toggle-theme" variant="ghost" size="icon" onClick={toggleTheme}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </Button>
      </div>
    </header>
  );
}
