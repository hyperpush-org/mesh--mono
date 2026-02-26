import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { workspace, ExtensionContext, window, Uri } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

function findMeshc(): string | undefined {
  // 1. Explicit user setting (non-default)
  const config = workspace.getConfiguration("mesh.lsp");
  const configured = config.get<string>("path");
  if (configured && configured !== "meshc") {
    if (fs.existsSync(configured)) {
      return configured;
    }
  }

  // 2. Workspace-local build (developing Mesh itself, or local install)
  const workspaceFolders = workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const candidates = [
        path.join(folder.uri.fsPath, "target", "debug", "meshc"),
        path.join(folder.uri.fsPath, "target", "release", "meshc"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return c;
        }
      }
    }
  }

  // 3. Well-known install locations
  const home = os.homedir();
  const wellKnown = [
    path.join(home, ".mesh", "bin", "meshc"),
    "/usr/local/bin/meshc",
    "/opt/homebrew/bin/meshc",
  ];
  for (const p of wellKnown) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 4. Fall back to PATH lookup (let the OS resolve it)
  return "meshc";
}

async function startClient(meshcPath: string) {
  const serverOptions: ServerOptions = {
    command: meshcPath,
    args: ["lsp"],
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "mesh" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.mpl"),
    },
  };

  client = new LanguageClient(
    "mesh-lsp",
    "Mesh Language Server",
    serverOptions,
    clientOptions
  );

  try {
    await client.start();
  } catch (err: any) {
    const action = await window.showErrorMessage(
      `Mesh LSP failed to start. Could not find or run '${meshcPath}'. ` +
        `Install Mesh or configure the path to meshc.`,
      "Configure Path",
      "Dismiss"
    );

    if (action === "Configure Path") {
      const uris = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        title: "Select the meshc binary",
        openLabel: "Select meshc",
      });

      if (uris && uris.length > 0) {
        const selected = uris[0].fsPath;
        await workspace
          .getConfiguration("mesh.lsp")
          .update("path", selected, true);
        window.showInformationMessage(
          `Mesh LSP path set to '${selected}'. Reload window to activate.`
        );
      }
    }
  }
}

export function activate(context: ExtensionContext) {
  const meshcPath = findMeshc();
  if (meshcPath) {
    startClient(meshcPath);
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
