"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function findMeshc() {
    // 1. Explicit user setting (non-default)
    const config = vscode_1.workspace.getConfiguration("mesh.lsp");
    const configured = config.get("path");
    if (configured && configured !== "meshc") {
        if (fs.existsSync(configured)) {
            return configured;
        }
    }
    // 2. Workspace-local build (developing Mesh itself, or local install)
    const workspaceFolders = vscode_1.workspace.workspaceFolders;
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
async function startClient(meshcPath) {
    const serverOptions = {
        command: meshcPath,
        args: ["lsp"],
    };
    const clientOptions = {
        documentSelector: [{ scheme: "file", language: "mesh" }],
        synchronize: {
            fileEvents: vscode_1.workspace.createFileSystemWatcher("**/*.mpl"),
        },
    };
    client = new node_1.LanguageClient("mesh-lsp", "Mesh Language Server", serverOptions, clientOptions);
    try {
        await client.start();
    }
    catch (err) {
        const action = await vscode_1.window.showErrorMessage(`Mesh LSP failed to start. Could not find or run '${meshcPath}'. ` +
            `Install Mesh or configure the path to meshc.`, "Configure Path", "Dismiss");
        if (action === "Configure Path") {
            const uris = await vscode_1.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                title: "Select the meshc binary",
                openLabel: "Select meshc",
            });
            if (uris && uris.length > 0) {
                const selected = uris[0].fsPath;
                await vscode_1.workspace
                    .getConfiguration("mesh.lsp")
                    .update("path", selected, true);
                vscode_1.window.showInformationMessage(`Mesh LSP path set to '${selected}'. Reload window to activate.`);
            }
        }
    }
}
function activate(context) {
    const meshcPath = findMeshc();
    if (meshcPath) {
        startClient(meshcPath);
    }
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
//# sourceMappingURL=extension.js.map