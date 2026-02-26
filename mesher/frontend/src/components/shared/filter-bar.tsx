import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterState {
  search?: string;
  status?: string;
  level?: string;
  environment?: string;
}

interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void;
  defaultStatus?: string;
  showSearch?: boolean;
  showStatus?: boolean;
  showLevel?: boolean;
  showEnvironment?: boolean;
}

export function FilterBar({
  onFilterChange,
  defaultStatus,
  showSearch = true,
  showStatus = false,
  showLevel = true,
  showEnvironment = false,
}: FilterBarProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(defaultStatus ?? "all");
  const [level, setLevel] = useState("all");
  const [environment, setEnvironment] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const isFirstRender = useRef(true);

  const emitFilters = useCallback(
    (overrides?: Partial<FilterState>) => {
      const filters: FilterState = {};

      const s = overrides?.search ?? search;
      const st = overrides?.status ?? status;
      const l = overrides?.level ?? level;
      const e = overrides?.environment ?? environment;

      if (s) filters.search = s;
      if (st && st !== "all") filters.status = st;
      if (l && l !== "all") filters.level = l;
      if (e) filters.environment = e;

      onFilterChange(filters);
    },
    [search, status, level, environment, onFilterChange]
  );

  // Emit default filters on mount (e.g., default 'unresolved' status)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      emitFilters();
    }
  }, [emitFilters]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      emitFilters({ search: value });
    }, 300);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    emitFilters({ status: value });
  };

  const handleLevelChange = (value: string) => {
    setLevel(value);
    emitFilters({ level: value });
  };

  const handleEnvironmentChange = (value: string) => {
    setEnvironment(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      emitFilters({ environment: value });
    }, 300);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-8 w-[200px] pl-8 text-sm"
          />
        </div>
      )}
      {showStatus && (
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showLevel && (
        <Select value={level} onValueChange={handleLevelChange}>
          <SelectTrigger size="sm" className="w-[110px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
      )}
      {showEnvironment && (
        <div className="relative">
          <Input
            placeholder="Environment"
            value={environment}
            onChange={(e) => handleEnvironmentChange(e.target.value)}
            className="h-8 w-[140px] text-sm"
          />
        </div>
      )}
    </div>
  );
}
