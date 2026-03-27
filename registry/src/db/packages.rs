use chrono::{DateTime, Utc};
use semver::Version as SemverVersion;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct PackageRow {
    pub name: String,
    pub owner_login: String,
    pub description: String,
    pub latest_version: Option<String>,
    pub download_count: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct VersionRow {
    pub id: Uuid,
    pub package_name: String,
    pub version: String,
    pub sha256: String,
    pub size_bytes: i64,
    pub readme: Option<String>,
    pub published_at: DateTime<Utc>,
    pub download_count: i64,
}

#[derive(Debug, sqlx::FromRow)]
pub struct SearchResult {
    pub name: String,
    pub version: Option<String>,
    pub description: String,
}

fn package_state_error(message: impl Into<String>) -> sqlx::Error {
    sqlx::Error::Protocol(message.into())
}

fn parse_semver(
    package_name: &str,
    version: &str,
    context: &str,
) -> Result<SemverVersion, sqlx::Error> {
    SemverVersion::parse(version).map_err(|error| {
        package_state_error(format!(
            "Invalid semver for {package_name} while {context}: {version} ({error})"
        ))
    })
}

fn derive_latest_version(package_name: &str, versions: &[String]) -> Result<String, sqlx::Error> {
    let mut latest: Option<(SemverVersion, String)> = None;

    for version in versions {
        let parsed = parse_semver(package_name, version, "deriving latest version")?;
        let should_replace = latest
            .as_ref()
            .map(|(current, _)| parsed > *current)
            .unwrap_or(true);
        if should_replace {
            latest = Some((parsed, version.clone()));
        }
    }

    latest.map(|(_, version)| version).ok_or_else(|| {
        package_state_error(format!(
            "No committed versions found for package {package_name}"
        ))
    })
}

/// Check whether a specific name+version already exists (for 409 duplicate detection).
pub async fn version_exists(
    pool: &PgPool,
    package_name: &str,
    version: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_scalar::<_, i32>(
        "SELECT 1 FROM versions WHERE package_name = $1 AND version = $2",
    )
    .bind(package_name)
    .bind(version)
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

/// Insert a new version. Creates the package row if it doesn't exist.
/// Returns Err if the UNIQUE(package_name, version) constraint fires (concurrent duplicate publish).
pub async fn insert_version(
    pool: &PgPool,
    package_name: &str,
    version: &str,
    sha256: &str,
    size_bytes: i64,
    readme: Option<String>,
    description: &str,
    owner_login: &str,
    published_by: Uuid,
) -> Result<(), sqlx::Error> {
    parse_semver(package_name, version, "accepting published version")?;

    let mut tx = pool.begin().await?;

    // Ensure the package row exists and keep the description fresh, but derive latest_version only
    // from committed version rows after the new version is inserted.
    sqlx::query(
        r#"
        INSERT INTO packages (name, owner_login, description, latest_version, updated_at)
        VALUES ($1, $2, $3, NULL, now())
        ON CONFLICT (name) DO UPDATE
          SET owner_login = EXCLUDED.owner_login,
              description = EXCLUDED.description,
              updated_at = now()
        "#,
    )
    .bind(package_name)
    .bind(owner_login)
    .bind(description)
    .execute(&mut *tx)
    .await?;

    // Insert version (will fail with unique violation if duplicate).
    sqlx::query(
        r#"
        INSERT INTO versions (package_name, version, sha256, size_bytes, readme, published_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(package_name)
    .bind(version)
    .bind(sha256)
    .bind(size_bytes)
    .bind(readme)
    .bind(published_by)
    .execute(&mut *tx)
    .await?;

    // Serialize latest-version refreshes per package and derive from committed version rows.
    sqlx::query_scalar::<_, i32>("SELECT 1 FROM packages WHERE name = $1 FOR UPDATE")
        .bind(package_name)
        .fetch_one(&mut *tx)
        .await?;

    let versions: Vec<String> =
        sqlx::query_scalar("SELECT version FROM versions WHERE package_name = $1")
            .bind(package_name)
            .fetch_all(&mut *tx)
            .await?;
    let latest_version = derive_latest_version(package_name, &versions)?;

    sqlx::query(
        r#"
        UPDATE packages
        SET latest_version = $2,
            description = $3,
            updated_at = now()
        WHERE name = $1
        "#,
    )
    .bind(package_name)
    .bind(latest_version)
    .bind(description)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

/// Get the latest package metadata.
pub async fn get_package(pool: &PgPool, name: &str) -> Result<Option<PackageRow>, sqlx::Error> {
    sqlx::query_as::<_, PackageRow>(
        "SELECT name, owner_login, description, latest_version, download_count, updated_at FROM packages WHERE name = $1"
    )
    .bind(name)
    .fetch_optional(pool)
    .await
}

/// Get version metadata (sha256, size, etc.).
pub async fn get_version(
    pool: &PgPool,
    package_name: &str,
    version: &str,
) -> Result<Option<VersionRow>, sqlx::Error> {
    sqlx::query_as::<_, VersionRow>(
        "SELECT id, package_name, version, sha256, size_bytes, readme, published_at, download_count FROM versions WHERE package_name = $1 AND version = $2"
    )
    .bind(package_name)
    .bind(version)
    .fetch_optional(pool)
    .await
}

/// Get all versions for a package, ordered newest first.
pub async fn list_versions(
    pool: &PgPool,
    package_name: &str,
) -> Result<Vec<VersionRow>, sqlx::Error> {
    sqlx::query_as::<_, VersionRow>(
        "SELECT id, package_name, version, sha256, size_bytes, readme, published_at, download_count FROM versions WHERE package_name = $1 ORDER BY published_at DESC"
    )
    .bind(package_name)
    .fetch_all(pool)
    .await
}

/// List all packages, ordered by download_count DESC then updated_at DESC.
pub async fn list_packages(
    pool: &PgPool,
    limit: i64,
    offset: i64,
) -> Result<Vec<PackageRow>, sqlx::Error> {
    sqlx::query_as::<_, PackageRow>(
        r#"
        SELECT
            p.name,
            p.owner_login,
            p.description,
            v.version AS latest_version,
            p.download_count,
            p.updated_at
        FROM packages p
        LEFT JOIN versions v
          ON v.package_name = p.name
         AND v.version = p.latest_version
        ORDER BY p.download_count DESC, p.updated_at DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
}

/// Search packages by name+description using PostgreSQL tsvector.
pub async fn search_packages(pool: &PgPool, query: &str) -> Result<Vec<SearchResult>, sqlx::Error> {
    sqlx::query_as::<_, SearchResult>(
        r#"
        SELECT p.name, v.version, p.description
        FROM packages p
        LEFT JOIN versions v
          ON v.package_name = p.name
         AND v.version = p.latest_version
        WHERE p.search_vec @@ plainto_tsquery('english', $1)
        ORDER BY ts_rank(p.search_vec, plainto_tsquery('english', $1)) DESC
        LIMIT 50
        "#,
    )
    .bind(query)
    .fetch_all(pool)
    .await
}

/// Atomically increment download counter for both version and package.
pub async fn increment_download(
    pool: &PgPool,
    package_name: &str,
    version: &str,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        "UPDATE versions SET download_count = download_count + 1 WHERE package_name = $1 AND version = $2"
    )
    .bind(package_name)
    .bind(version)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE packages SET download_count = download_count + 1 WHERE name = $1")
        .bind(package_name)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{get_package, insert_version};
    use sqlx::PgPool;
    use uuid::Uuid;

    async fn insert_user(pool: &PgPool, login: &str) -> sqlx::Result<Uuid> {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO users (id, github_id, github_login, email) VALUES ($1, $2, $3, $4)",
        )
        .bind(id)
        .bind(1_i64)
        .bind(login)
        .bind(format!("{login}@example.test"))
        .execute(pool)
        .await?;
        Ok(id)
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn latest_version_stays_monotonic_for_out_of_order_publishes(
        pool: PgPool,
    ) -> sqlx::Result<()> {
        let user_id = insert_user(&pool, "snowdamiz").await?;
        let package_name = "snowdamiz/mesh-proof";
        let newer = "0.34.0-20260327191246-2503";
        let older = "0.34.0-20260327191241-2432";

        insert_version(
            &pool,
            package_name,
            newer,
            "sha-new",
            128,
            Some("# newer readme".to_string()),
            "newest description",
            "snowdamiz",
            user_id,
        )
        .await?;

        insert_version(
            &pool,
            package_name,
            older,
            "sha-old",
            64,
            Some("# older readme".to_string()),
            "refreshed package description",
            "snowdamiz",
            user_id,
        )
        .await?;

        let package = get_package(&pool, package_name)
            .await?
            .expect("package row should exist");
        assert_eq!(package.latest_version.as_deref(), Some(newer));
        assert_eq!(package.description, "refreshed package description");

        Ok(())
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn duplicate_version_publish_still_fails_closed(pool: PgPool) -> sqlx::Result<()> {
        let user_id = insert_user(&pool, "snowdamiz").await?;
        let package_name = "snowdamiz/mesh-proof";
        let version = "0.34.0-20260327191246-2503";

        insert_version(
            &pool,
            package_name,
            version,
            "sha-new",
            128,
            None,
            "description",
            "snowdamiz",
            user_id,
        )
        .await?;

        let error = insert_version(
            &pool,
            package_name,
            version,
            "sha-new",
            128,
            None,
            "description",
            "snowdamiz",
            user_id,
        )
        .await
        .expect_err("duplicate publish should fail");

        let error_text = error.to_string().to_ascii_lowercase();
        assert!(error_text.contains("unique") || error_text.contains("duplicate"));

        Ok(())
    }
}
