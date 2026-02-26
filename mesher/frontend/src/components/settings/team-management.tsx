import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Member } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

interface TeamManagementProps {
  orgId: string;
}

function roleBadge(role: string) {
  switch (role) {
    case "owner":
      return <Badge variant="default">owner</Badge>;
    case "admin":
      return <Badge variant="secondary">admin</Badge>;
    case "member":
      return <Badge variant="outline">member</Badge>;
    default:
      return <Badge variant="outline">{role}</Badge>;
  }
}

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TeamManagement({ orgId }: TeamManagementProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [isAdding, setIsAdding] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await api.team.members(orgId);
      setMembers(data);
    } catch (err) {
      toast.error("Failed to load team members", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function handleAddMember() {
    if (!newUserId.trim()) {
      toast.error("User ID is required");
      return;
    }
    setIsAdding(true);
    try {
      await api.team.addMember(orgId, newUserId.trim(), newRole);
      toast.success("Member added");
      setAddDialogOpen(false);
      setNewUserId("");
      setNewRole("member");
      fetchMembers();
    } catch (err) {
      toast.error("Failed to add member", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRoleChange(membershipId: string, role: string) {
    try {
      await api.team.updateRole(orgId, membershipId, role);
      toast.success("Role updated");
      fetchMembers();
    } catch (err) {
      toast.error("Failed to update role", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleRemove(membershipId: string) {
    try {
      await api.team.removeMember(orgId, membershipId);
      toast.success("Member removed");
      fetchMembers();
    } catch (err) {
      toast.error("Failed to remove member", {
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
          {members.length} member{members.length !== 1 ? "s" : ""}
        </p>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add a user to the organization by their user ID.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-id">User ID</Label>
                <Input
                  id="user-id"
                  placeholder="Enter user ID"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-role">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger id="new-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={isAdding}>
                {isAdding && <Loader2 className="animate-spin" />}
                Add Member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="size-8 mb-2 opacity-50" />
          <p className="text-sm">No team members</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.display_name || member.user_id}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.email}
                </TableCell>
                <TableCell>
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      handleRoleChange(member.id, role)
                    }
                  >
                    <SelectTrigger className="w-[100px] h-7 text-xs">
                      <SelectValue>
                        {roleBadge(member.role)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {relativeDate(member.joined_at)}
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-xs">
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Member</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to remove{" "}
                          {member.display_name || member.user_id} from the
                          team?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => handleRemove(member.id)}
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-muted-foreground italic mt-4">
        Organization and project management will be available in a future
        update.
      </p>
    </div>
  );
}
