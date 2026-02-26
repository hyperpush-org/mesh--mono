import type { Alert } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, Eye, AlertCircle } from "lucide-react";

interface AlertListProps {
  alerts: Alert[];
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
}

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="size-3" />
          Active
        </Badge>
      );
    case "acknowledged":
      return (
        <Badge variant="secondary" className="gap-1 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
          <Eye className="size-3" />
          Acknowledged
        </Badge>
      );
    case "resolved":
      return (
        <Badge variant="secondary" className="gap-1 bg-green-500/15 text-green-700 dark:text-green-400">
          <CheckCircle className="size-3" />
          Resolved
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}


export function AlertList({ alerts, onAcknowledge, onResolve }: AlertListProps) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="size-8 mb-2 opacity-50" />
        <p className="text-sm">No alerts fired</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rule Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="max-w-[300px]">Message</TableHead>
          <TableHead>Triggered</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alerts.map((alert) => (
          <TableRow key={alert.id}>
            <TableCell className="font-medium">{alert.rule_name}</TableCell>
            <TableCell>{statusBadge(alert.status)}</TableCell>
            <TableCell className="max-w-[300px] truncate" title={alert.message}>
              {alert.message}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatRelativeTime(alert.triggered_at)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                {alert.status === "active" && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onAcknowledge(alert.id)}
                  >
                    Acknowledge
                  </Button>
                )}
                {(alert.status === "active" ||
                  alert.status === "acknowledged") && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onResolve(alert.id)}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
