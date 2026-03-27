import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const helperPath = path.join(root, "scripts", "verify-m034-s06-remote-evidence.sh");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function runHelper(label, env) {
  return spawnSync("bash", [helperPath, label], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function defaultRemoteRunsPayload() {
  return {
    repository: "snowdamiz/mesh-lang",
    workflows: [
      {
        workflowFile: "deploy.yml",
        status: "failed",
        requiredHeadBranch: "main",
        expectedRef: "refs/heads/main",
        expectedHeadSha: "163f24009b868256d7a3d144dd3a68bddce5a660",
        observedHeadSha: "5ddf3b2dce17abe08e1188d9b46e575d83525b50",
        freshnessStatus: "failed",
        freshnessFailure: "deploy.yml hosted run headSha '5ddf3b2dce17abe08e1188d9b46e575d83525b50' did not match expected 'refs/heads/main' sha '163f24009b868256d7a3d144dd3a68bddce5a660'",
        headShaMatchesExpected: false,
        failure: "deploy.yml hosted run headSha '5ddf3b2dce17abe08e1188d9b46e575d83525b50' did not match expected 'refs/heads/main' sha '163f24009b868256d7a3d144dd3a68bddce5a660'",
        runSummary: {
          headBranch: "main",
          headSha: "5ddf3b2dce17abe08e1188d9b46e575d83525b50",
          url: "https://github.com/snowdamiz/mesh-lang/actions/runs/23506361663",
        },
        latestAvailableRun: {
          headBranch: "main",
          headSha: "5ddf3b2dce17abe08e1188d9b46e575d83525b50",
          url: "https://github.com/snowdamiz/mesh-lang/actions/runs/23506361663",
        },
      },
    ],
  };
}

function createStubHarness(
  t,
  {
    exitCode = 1,
    includeRemoteRuns = true,
    archiveLabel = "contract-red",
    remoteRunsPayload = defaultRemoteRunsPayload(),
  } = {},
) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-m034-s06-"));
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  const verifyRoot = path.join(tmpRoot, "m034-s05-verify");
  const evidenceRoot = path.join(tmpRoot, "m034-s06-evidence");
  const invokedMarker = path.join(tmpRoot, "stub-invoked.txt");
  const stubPath = path.join(tmpRoot, "stub-verify-m034-s05.sh");

  const remoteRunsBlock = includeRemoteRuns
    ? `cat >"$VERIFY_ROOT/remote-runs.json" <<'JSON'\n${JSON.stringify(remoteRunsPayload, null, 2)}\nJSON`
    : 'rm -f "$VERIFY_ROOT/remote-runs.json"';

  fs.writeFileSync(
    stubPath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${VERIFY_M034_S05_STOP_AFTER:-}" != "remote-evidence" ]]; then
  echo "expected VERIFY_M034_S05_STOP_AFTER=remote-evidence" >&2
  exit 91
fi

VERIFY_ROOT="\${M034_S05_VERIFY_ROOT:?}"
mkdir -p "$VERIFY_ROOT"
printf 'stub invoked\n' >"${invokedMarker}"
printf 'remote-evidence\n' >"$VERIFY_ROOT/current-phase.txt"
printf 'failed\n' >"$VERIFY_ROOT/status.txt"
printf 'remote-evidence\n' >"$VERIFY_ROOT/failed-phase.txt"
cat >"$VERIFY_ROOT/phase-report.txt" <<'EOF'
prereq-sweep	started
prereq-sweep	passed
candidate-tags	started
candidate-tags	passed
remote-evidence	started
remote-evidence	failed
EOF
cat >"$VERIFY_ROOT/candidate-tags.json" <<'JSON'
${JSON.stringify(
  {
    meshcVersion: "0.1.0",
    meshpkgVersion: "0.1.0",
    extensionVersion: "0.3.0",
    binaryTag: "v0.1.0",
    extensionTag: "ext-v0.3.0",
  },
  null,
  2,
)}
JSON
${remoteRunsBlock}
printf 'display: gh run list\n' >"$VERIFY_ROOT/remote-deploy-list.log"
exit ${exitCode}
`,
    { mode: 0o755 },
  );

  return {
    archiveLabel,
    evidenceRoot,
    invokedMarker,
    stubPath,
    verifyRoot,
  };
}

test("verify-m034-s05 exposes an explicit stop-after remote-evidence boundary", () => {
  const script = read("scripts/verify-m034-s05.sh");
  assert.match(
    script,
    /usage: bash scripts\/verify-m034-s05\.sh \[--stop-after remote-evidence\]/,
    "S05 verifier should document the stop-after operator surface",
  );
  assert.match(
    script,
    /run_remote_evidence\nif should_stop_after_phase "remote-evidence"; then\n  complete_stop_after_phase "remote-evidence"\nfi\nrun_public_http_truth/,
    "S05 verifier must stop cleanly after remote-evidence before public-http",
  );
});

test("remote-evidence helper archives a red hosted bundle and returns the verifier exit code", (t) => {
  const harness = createStubHarness(t, { exitCode: 1, includeRemoteRuns: true, archiveLabel: "contract-red" });
  const result = runHelper(harness.archiveLabel, {
    M034_S05_VERIFY_SCRIPT: harness.stubPath,
    M034_S05_VERIFY_ROOT: harness.verifyRoot,
    M034_S06_EVIDENCE_ROOT: harness.evidenceRoot,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.ok(fs.existsSync(harness.invokedMarker), "wrapper should invoke the S05 verifier when the label is new");

  const archiveRoot = path.join(harness.evidenceRoot, harness.archiveLabel);
  assert.ok(fs.existsSync(path.join(archiveRoot, "remote-runs.json")), "red remote evidence should still be archived");
  assert.ok(fs.existsSync(path.join(archiveRoot, "candidate-tags.json")), "candidate tags should be archived");
  assert.ok(fs.existsSync(path.join(archiveRoot, "remote-deploy-list.log")), "remote logs should be archived");

  const manifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.label, harness.archiveLabel);
  assert.equal(manifest.stopAfterPhase, "remote-evidence");
  assert.equal(manifest.s05ExitCode, 1);
  assert.equal(manifest.failedPhase, "remote-evidence");
  assert.equal(manifest.gitRefs.binaryTag, "v0.1.0");
  assert.equal(manifest.gitRefs.extensionTag, "ext-v0.3.0");
  assert.deepEqual(manifest.phaseReport.slice(-2), ["remote-evidence\tstarted", "remote-evidence\tfailed"]);
  assert.ok(
    manifest.artifacts.contents.includes("manifest.json") && manifest.artifacts.contents.includes("remote-runs.json"),
    "manifest should inventory the copied bundle contents",
  );
  assert.equal(manifest.remoteRunsSummary[0].workflowFile, "deploy.yml");
  assert.equal(manifest.remoteRunsSummary[0].expectedRef, "refs/heads/main");
  assert.equal(manifest.remoteRunsSummary[0].expectedHeadSha, "163f24009b868256d7a3d144dd3a68bddce5a660");
  assert.equal(manifest.remoteRunsSummary[0].observedHeadSha, "5ddf3b2dce17abe08e1188d9b46e575d83525b50");
  assert.equal(manifest.remoteRunsSummary[0].freshnessStatus, "failed");
  assert.match(manifest.remoteRunsSummary[0].freshnessFailure, /did not match expected/);
  assert.equal(manifest.remoteRunsSummary[0].headShaMatchesExpected, false);
  assert.equal(manifest.remoteRunsSummary[0].latestAvailableHeadSha, "5ddf3b2dce17abe08e1188d9b46e575d83525b50");
  assert.match(result.stdout, new RegExp(`archive: .*${harness.archiveLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("remote-evidence helper fails closed when required hosted artifacts are missing", (t) => {
  const harness = createStubHarness(t, { exitCode: 1, includeRemoteRuns: false, archiveLabel: "missing-remote-runs" });
  const result = runHelper(harness.archiveLabel, {
    M034_S05_VERIFY_SCRIPT: harness.stubPath,
    M034_S05_VERIFY_ROOT: harness.verifyRoot,
    M034_S06_EVIDENCE_ROOT: harness.evidenceRoot,
  });

  assert.notEqual(result.status, 0, "archive contract should fail when remote-runs.json is missing");
  assert.match(result.stderr, /missing remote runs artifact/);
  assert.ok(!fs.existsSync(path.join(harness.evidenceRoot, harness.archiveLabel)), "failed archive contracts must not leave a destination bundle behind");
});

test("remote-evidence helper fails closed when freshness fields are missing from remote-runs.json", (t) => {
  const payload = defaultRemoteRunsPayload();
  delete payload.workflows[0].expectedHeadSha;
  delete payload.workflows[0].observedHeadSha;
  delete payload.workflows[0].freshnessStatus;
  delete payload.workflows[0].freshnessFailure;

  const harness = createStubHarness(t, {
    exitCode: 1,
    includeRemoteRuns: true,
    archiveLabel: "missing-freshness-fields",
    remoteRunsPayload: payload,
  });
  const result = runHelper(harness.archiveLabel, {
    M034_S05_VERIFY_SCRIPT: harness.stubPath,
    M034_S05_VERIFY_ROOT: harness.verifyRoot,
    M034_S06_EVIDENCE_ROOT: harness.evidenceRoot,
  });

  assert.notEqual(result.status, 0, "archive contract should fail when freshness fields are missing");
  assert.match(result.stderr, /archive manifest drift:/);
  assert.match(result.stderr, /missing freshness fields in remote-runs\.json/);
  assert.ok(!fs.existsSync(path.join(harness.evidenceRoot, harness.archiveLabel)), "freshness drift must not create a final archive directory");
});

test("remote-evidence helper refuses to overwrite an existing label directory", (t) => {
  const harness = createStubHarness(t, { exitCode: 0, includeRemoteRuns: true, archiveLabel: "preexisting-label" });
  const existingArchiveRoot = path.join(harness.evidenceRoot, harness.archiveLabel);
  fs.mkdirSync(existingArchiveRoot, { recursive: true });

  const result = runHelper(harness.archiveLabel, {
    M034_S05_VERIFY_SCRIPT: harness.stubPath,
    M034_S05_VERIFY_ROOT: harness.verifyRoot,
    M034_S06_EVIDENCE_ROOT: harness.evidenceRoot,
  });

  assert.notEqual(result.status, 0, "existing label directories must fail closed");
  assert.match(result.stderr, /archive label already exists/);
  assert.ok(!fs.existsSync(harness.invokedMarker), "overwrite refusal should happen before the S05 verifier runs");
});
