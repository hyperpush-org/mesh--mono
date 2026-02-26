import { create } from "zustand";

interface Project {
  id: string;
  name: string;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  setActiveProject: (id: string) => void;
  setProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [{ id: "default", name: "Default Project" }],
  activeProjectId: "default",
  setActiveProject: (id) => set({ activeProjectId: id }),
  setProjects: (projects) => set({ projects }),
}));
