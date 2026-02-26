import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useProjectStore } from "@/stores/project-store";
import { useWsStore } from "@/stores/ws-store";
import type { Alert, AlertRule } from "@/types/api";
import {
  AlertRuleForm,
  type CreateRulePayload,
} from "@/components/alerts/alert-rule-form";
import { AlertList } from "@/components/alerts/alert-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Bell, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function conditionDescription(rule: AlertRule): string {
  const { condition } = rule;
  switch (condition.condition_type) {
    case "threshold":
      return `${condition.threshold} events in ${condition.window_minutes}min`;
    case "new_issue":
      return "When a new issue is created";
    case "regression":
      return "When a resolved issue regresses";
    default:
      return condition.condition_type;
  }
}

function formatNullableTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return formatRelativeTime(dateStr);
}

export default function AlertsPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Rules state
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Fired alerts state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // WebSocket alert notifications
  const lastEvent = useWsStore((s) => s.lastEvent);

  const fetchRules = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.alerts.rules(activeProjectId);
      setRules(data);
    } catch (err) {
      toast.error("Failed to load alert rules", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRulesLoading(false);
    }
  }, [activeProjectId]);

  const fetchAlerts = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const status = statusFilter === "all" ? undefined : statusFilter;
      const data = await api.alerts.list(activeProjectId, status);
      setAlerts(data);
    } catch (err) {
      toast.error("Failed to load alerts", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setAlertsLoading(false);
    }
  }, [activeProjectId, statusFilter]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Listen for WebSocket alert messages
  useEffect(() => {
    if (lastEvent?.type === "alert") {
      toast.warning("Alert Fired", {
        description: `${lastEvent.rule_name}: ${lastEvent.message}`,
        duration: 8000,
      });
      // Refetch fired alerts to include the new one
      fetchAlerts();
    }
  }, [lastEvent, fetchAlerts]);

  async function handleCreateRule(payload: CreateRulePayload) {
    if (!activeProjectId) return;
    setIsCreating(true);
    try {
      await api.alerts.createRule(activeProjectId, payload as Parameters<typeof api.alerts.createRule>[1]);
      toast.success("Alert rule created");
      setCreateDialogOpen(false);
      fetchRules();
    } catch (err) {
      toast.error("Failed to create rule", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleRule(ruleId: string, currentEnabled: boolean) {
    try {
      await api.alerts.toggleRule(ruleId, !currentEnabled);
      toast.success(
        currentEnabled ? "Rule disabled" : "Rule enabled"
      );
      fetchRules();
    } catch (err) {
      toast.error("Failed to toggle rule", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleDeleteRule(ruleId: string) {
    try {
      await api.alerts.deleteRule(ruleId);
      toast.success("Rule deleted");
      fetchRules();
    } catch (err) {
      toast.error("Failed to delete rule", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleAcknowledge(alertId: string) {
    try {
      await api.alerts.acknowledge(alertId);
      toast.success("Alert acknowledged");
      fetchAlerts();
    } catch (err) {
      toast.error("Failed to acknowledge alert", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleResolve(alertId: string) {
    try {
      await api.alerts.resolve(alertId);
      toast.success("Alert resolved");
      fetchAlerts();
    } catch (err) {
      toast.error("Failed to resolve alert", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const activeAlertCount = alerts.filter((a) => a.status === "active").length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Alerts</h2>
        <p className="text-sm text-muted-foreground">
          Manage alert rules and view fired alerts
        </p>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" className="gap-1.5">
            <Bell className="size-4" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="fired" className="gap-1.5">
            <AlertCircle className="size-4" />
            Fired Alerts
            {activeAlertCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {activeAlertCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Rules tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="size-4" />
                  Create Rule
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Alert Rule</DialogTitle>
                  <DialogDescription>
                    Configure conditions that trigger alert notifications.
                  </DialogDescription>
                </DialogHeader>
                <AlertRuleForm
                  projectId={activeProjectId ?? ""}
                  onSubmit={handleCreateRule}
                  onCancel={() => setCreateDialogOpen(false)}
                  isSubmitting={isCreating}
                />
              </DialogContent>
            </Dialog>
          </div>

          {rulesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="size-8 mb-2 opacity-50" />
              <p className="text-sm">No alert rules configured</p>
              <p className="text-xs mt-1">
                Create a rule to start monitoring events
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id} className="py-4">
                  <CardHeader className="pb-0 pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() =>
                            handleToggleRule(rule.id, rule.enabled)
                          }
                          size="sm"
                        />
                        <CardTitle className="text-sm">{rule.name}</CardTitle>
                        {!rule.enabled && (
                          <Badge variant="secondary" className="text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-xs">
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{rule.name}"?
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Condition:{" "}
                        <span className="text-foreground">
                          {conditionDescription(rule)}
                        </span>
                      </span>
                      <span>
                        Cooldown:{" "}
                        <span className="text-foreground">
                          {rule.cooldown_minutes}min
                        </span>
                      </span>
                      <span>
                        Last fired:{" "}
                        <span className="text-foreground">
                          {formatNullableTime(rule.last_fired_at)}
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Fired Alerts tab */}
        <TabsContent value="fired" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </p>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {alertsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <AlertList
              alerts={alerts}
              onAcknowledge={handleAcknowledge}
              onResolve={handleResolve}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
