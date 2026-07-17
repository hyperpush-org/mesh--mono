#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_NAME
readonly E2E_OWNER_ID='11111111-1111-4111-8111-111111111111'
readonly E2E_CANDIDATE_ID='33333333-3333-4333-8333-333333333333'
readonly E2E_SESSION_TOKEN="${MESHER_E2E_SESSION_TOKEN:-hyperpush-e2e-session-token-0000000000000000000000000000}"

if [[ $# -ne 0 ]]; then
  printf 'usage: bash mesher/scripts/%s\n' "$SCRIPT_NAME" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf '[%s] DATABASE_URL must be set\n' "$SCRIPT_NAME" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  printf '[%s] required command missing from PATH: psql\n' "$SCRIPT_NAME" >&2
  exit 1
fi

psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v e2e_session_token="$E2E_SESSION_TOKEN" \
  -v e2e_owner_id="$E2E_OWNER_ID" \
  -v e2e_candidate_id="$E2E_CANDIDATE_ID" <<'SQL' >/dev/null
INSERT INTO users (id, email, password_hash, display_name)
VALUES
  (:'e2e_owner_id'::uuid, 'seed-owner@hyperpush.dev', crypt('seed-password', gen_salt('bf', 12)), 'Seed Owner'),
  (:'e2e_candidate_id'::uuid, 'seed-candidate@hyperpush.dev', crypt('seed-password', gen_salt('bf', 12)), 'Seed Candidate')
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    display_name = EXCLUDED.display_name;

INSERT INTO org_memberships (id, user_id, org_id, role)
SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
       :'e2e_owner_id'::uuid,
       organizations.id,
       'owner'
FROM organizations
WHERE slug = 'default'
ON CONFLICT (id) DO UPDATE
SET user_id = EXCLUDED.user_id,
    org_id = EXCLUDED.org_id,
    role = 'owner';

INSERT INTO sessions (token, user_id, expires_at)
VALUES (:'e2e_session_token', :'e2e_owner_id'::uuid, now() + interval '24 hours')
ON CONFLICT (token) DO UPDATE
SET user_id = EXCLUDED.user_id,
    created_at = now(),
    expires_at = EXCLUDED.expires_at;
SQL

printf '[%s] seeded owner, candidate, and expiring bearer session\n' "$SCRIPT_NAME" >&2
