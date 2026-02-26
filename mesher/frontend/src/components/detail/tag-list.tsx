interface TagListProps {
  tags: Record<string, string> | null | undefined;
}

export function TagList({ tags }: TagListProps) {
  if (!tags || Object.keys(tags).length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No tags</p>
    );
  }

  const entries = Object.entries(tags);

  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline gap-2 bg-muted rounded px-2 py-1 min-w-0"
        >
          <span className="text-muted-foreground font-mono text-xs shrink-0">
            {key}
          </span>
          <span className="font-mono text-sm truncate">{value}</span>
        </div>
      ))}
    </div>
  );
}
