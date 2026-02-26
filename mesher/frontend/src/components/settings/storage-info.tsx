import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectStorage } from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface StorageInfoProps {
  projectId: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function StorageInfo({ projectId }: StorageInfoProps) {
  const [storage, setStorage] = useState<ProjectStorage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStorage = useCallback(async () => {
    try {
      const data = await api.settings.storage(projectId);
      setStorage(data);
    } catch (err) {
      toast.error("Failed to load storage info", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchStorage();
  }, [fetchStorage]);

  function handleRefresh() {
    setRefreshing(true);
    fetchStorage();
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={`size-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {storage ? (
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Database className="size-3.5" />
                Event Count
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {formatNumber(storage.event_count)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total stored events
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Database className="size-3.5" />
                Estimated Storage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {formatBytes(storage.estimated_bytes)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Approximate disk usage
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Database className="size-8 mb-2 opacity-50" />
          <p className="text-sm">Unable to load storage info</p>
        </div>
      )}
    </div>
  );
}
