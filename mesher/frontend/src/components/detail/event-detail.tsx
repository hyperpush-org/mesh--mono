import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { StackTrace } from "@/components/detail/stack-trace";
import { Breadcrumbs } from "@/components/detail/breadcrumbs";
import { TagList } from "@/components/detail/tag-list";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import type { EventDetail as EventDetailType } from "@/types/api";

interface EventDetailProps {
  eventId: string;
  onClose: () => void;
}

export function EventDetail({ eventId, onClose }: EventDetailProps) {
  const [data, setData] = useState<EventDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [navLoading, setNavLoading] = useState(false);

  const fetchEvent = useCallback(async (id: string, isNav = false) => {
    if (isNav) setNavLoading(true);
    else setLoading(true);

    try {
      const result = await api.events.detail(id);
      setData(result);
    } catch (err) {
      console.error("Failed to fetch event detail:", err);
    } finally {
      setLoading(false);
      setNavLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvent(eventId);
  }, [eventId, fetchEvent]);

  const handleNav = (id: string | null) => {
    if (!id || navLoading) return;
    fetchEvent(id, true);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Skeleton className="h-5 w-48" />
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm text-muted-foreground">Event not found</span>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  const { event, navigation } = data;
  const levelValid = ["error", "warning", "info", "debug"].includes(
    event.level
  );
  const userCtx = event.user_context as Record<string, unknown> | null;
  const exception = event.exception as {
    type?: string;
    value?: string;
  } | null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge
            variant={
              levelValid
                ? (event.level as "error" | "warning" | "info" | "debug")
                : "info"
            }
          />
          <span className="font-mono text-xs text-muted-foreground truncate">
            {event.id.slice(0, 12)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Prev / Next navigation */}
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!navigation.prev_id || navLoading}
            onClick={() => handleNav(navigation.prev_id)}
            title="Previous event"
          >
            {navLoading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ChevronLeft className="size-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={!navigation.next_id || navLoading}
            onClick={() => handleNav(navigation.next_id)}
            title="Next event"
          >
            <ChevronRight className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Message */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Message
            </h3>
            <p className="text-sm font-medium break-words">{event.message}</p>
          </section>

          {/* Exception */}
          {exception && (exception.type || exception.value) && (
            <>
              <Separator />
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Exception
                </h3>
                {exception.type && (
                  <p className="text-sm font-mono font-semibold">
                    {exception.type}
                  </p>
                )}
                {exception.value && (
                  <p className="text-sm text-muted-foreground break-words">
                    {exception.value}
                  </p>
                )}
              </section>
            </>
          )}

          {/* Stack Trace */}
          <Separator />
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Stack Trace
            </h3>
            <StackTrace stacktrace={event.stacktrace} />
          </section>

          {/* Breadcrumbs */}
          <Separator />
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Breadcrumbs
            </h3>
            <Breadcrumbs breadcrumbs={event.breadcrumbs} />
          </section>

          {/* Tags */}
          <Separator />
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Tags
            </h3>
            <TagList tags={event.tags} />
          </section>

          {/* User Context */}
          {userCtx &&
            Object.keys(userCtx).length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    User
                  </h3>
                  <div className="rounded-md border border-border p-3 space-y-1">
                    {userCtx.id != null && (
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="text-muted-foreground text-xs">
                          ID
                        </span>
                        <span className="font-mono">{String(userCtx.id)}</span>
                      </div>
                    )}
                    {userCtx.email != null && (
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="text-muted-foreground text-xs">
                          Email
                        </span>
                        <span>{String(userCtx.email)}</span>
                      </div>
                    )}
                    {userCtx.username != null && (
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="text-muted-foreground text-xs">
                          Username
                        </span>
                        <span>{String(userCtx.username)}</span>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

          {/* SDK Info */}
          {(event.sdk_name || event.sdk_version) && (
            <>
              <Separator />
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  SDK
                </h3>
                <p className="text-sm text-muted-foreground">
                  {event.sdk_name}
                  {event.sdk_version && ` v${event.sdk_version}`}
                </p>
              </section>
            </>
          )}

          {/* Metadata */}
          <Separator />
          <section className="pb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Metadata
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground text-xs">Received</span>
                <span>{formatRelativeTime(event.received_at)}</span>
              </div>
              {event.fingerprint && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">
                    Fingerprint
                  </span>
                  <span className="font-mono text-xs truncate">
                    {event.fingerprint}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
