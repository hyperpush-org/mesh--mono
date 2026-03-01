CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id   BIGINT UNIQUE NOT NULL,
    github_login TEXT NOT NULL,
    email       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    hash        TEXT NOT NULL,
    last_used   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tokens_user ON tokens(user_id);

CREATE TABLE packages (
    name            TEXT PRIMARY KEY,
    owner_login     TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    latest_version  TEXT,
    download_count  BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_packages_downloads ON packages(download_count DESC);
CREATE INDEX idx_packages_updated ON packages(updated_at DESC);

CREATE TABLE versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name    TEXT NOT NULL REFERENCES packages(name) ON DELETE CASCADE,
    version         TEXT NOT NULL,
    sha256          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    readme          TEXT,
    published_by    UUID NOT NULL REFERENCES users(id),
    published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    download_count  BIGINT NOT NULL DEFAULT 0,
    UNIQUE(package_name, version)
);
CREATE INDEX idx_versions_package ON versions(package_name, published_at DESC);
