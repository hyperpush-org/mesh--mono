import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ApiKey } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ApiKeysProps {
  projectId: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return key.slice(0, 8) + "...";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}

export function ApiKeys({ projectId }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // After creating a key, show the full value once
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api.team.apiKeys(projectId);
      setKeys(data);
    } catch (err) {
      toast.error("Failed to load API keys", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleCreateKey() {
    setIsCreating(true);
    try {
      const result = await api.team.createKey(
        projectId,
        newLabel.trim() || undefined
      );
      setNewKeyValue(result.key_value);
      toast.success("API key created");
      setNewLabel("");
      fetchKeys();
    } catch (err) {
      toast.error("Failed to create API key", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      await api.team.revokeKey(keyId);
      toast.success("API key revoked");
      fetchKeys();
    } catch (err) {
      toast.error("Failed to revoke key", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {keys.length} key{keys.length !== 1 ? "s" : ""}
        </p>
        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              setNewKeyValue(null);
              setNewLabel("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {newKeyValue ? "API Key Created" : "Create API Key"}
              </DialogTitle>
              <DialogDescription>
                {newKeyValue
                  ? "Copy this key now. It will not be shown again."
                  : "Optionally provide a label for this API key."}
              </DialogDescription>
            </DialogHeader>

            {newKeyValue ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
                  <code className="flex-1 break-all">{newKeyValue}</code>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => copyToClipboard(newKeyValue)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setCreateDialogOpen(false);
                      setNewKeyValue(null);
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="key-label">Label (optional)</Label>
                  <Input
                    id="key-label"
                    placeholder="e.g. Production ingestion"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateKey} disabled={isCreating}>
                    {isCreating && <Loader2 className="animate-spin" />}
                    Create Key
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Key className="size-8 mb-2 opacity-50" />
          <p className="text-sm">No API keys</p>
          <p className="text-xs mt-1">
            Create an API key to start ingesting events
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((apiKey) => {
              const isRevoked = apiKey.revoked_at !== null;
              return (
                <TableRow key={apiKey.id}>
                  <TableCell
                    className={`font-medium ${isRevoked ? "line-through opacity-50" : ""}`}
                  >
                    {apiKey.label || "Unnamed"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <code
                        className={`text-xs font-mono ${isRevoked ? "line-through opacity-50" : ""}`}
                      >
                        {maskKey(apiKey.key_value)}
                      </code>
                      {!isRevoked && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => copyToClipboard(apiKey.key_value)}
                        >
                          <Copy className="size-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(apiKey.created_at)}
                  </TableCell>
                  <TableCell>
                    {isRevoked ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px]"
                      >
                        Revoked
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400"
                      >
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isRevoked && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-xs">
                            <Trash2 className="size-3.5 text-muted-foreground" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to revoke this key? Any
                              services using it will lose access immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleRevoke(apiKey.id)}
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
