import { useProjectStore } from "@/stores/project-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectSettings } from "@/components/settings/project-settings";
import { TeamManagement } from "@/components/settings/team-management";
import { ApiKeys } from "@/components/settings/api-keys";
import { StorageInfo } from "@/components/settings/storage-info";
import { Settings, Users, Key, Database } from "lucide-react";

const ORG_ID = "default";

export default function SettingsPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  if (!activeProjectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">No project selected</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          {activeProject?.name ?? activeProjectId}
        </p>
      </div>

      <Tabs defaultValue="project">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="project" className="gap-1.5">
            <Settings className="size-4" />
            Project
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="size-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-1.5">
            <Key className="size-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-1.5">
            <Database className="size-4" />
            Storage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="project" className="pt-2">
          <ProjectSettings projectId={activeProjectId} />
        </TabsContent>

        <TabsContent value="team" className="pt-2">
          <TeamManagement orgId={ORG_ID} />
        </TabsContent>

        <TabsContent value="api-keys" className="pt-2">
          <ApiKeys projectId={activeProjectId} />
        </TabsContent>

        <TabsContent value="storage" className="pt-2">
          <StorageInfo projectId={activeProjectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
