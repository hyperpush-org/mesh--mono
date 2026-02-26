import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  hasMore: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

export function Pagination({
  hasMore,
  hasPrevious,
  onNext,
  onPrevious,
}: PaginationProps) {
  if (!hasMore && !hasPrevious) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground mr-2">
        Showing results
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={!hasPrevious}
      >
        <ChevronLeft className="size-4" />
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={!hasMore}
      >
        Next
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
