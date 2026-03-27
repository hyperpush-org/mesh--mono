use crate::{db, error::AppError, state::AppState};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Serialize;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Serialize)]
pub struct VersionListItem {
    pub version: String,
    pub published_at: chrono::DateTime<chrono::Utc>,
    pub download_count: i64,
    pub size_bytes: i64,
}

/// GET /api/v1/packages/{owner}/{package}/versions
/// Returns all versions for a package ordered newest first.
pub async fn versions_handler(
    State(state): State<Arc<AppState>>,
    Path((owner, package)): Path<(String, String)>,
) -> Result<Json<Vec<VersionListItem>>, AppError> {
    let name = format!("{}/{}", owner, package);
    // Ensure package exists (returns 404 if not)
    db::packages::get_package(&state.pool, &name)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    let versions = db::packages::list_versions(&state.pool, &name)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(
        versions
            .into_iter()
            .map(|v| VersionListItem {
                version: v.version,
                published_at: v.published_at,
                download_count: v.download_count,
                size_bytes: v.size_bytes,
            })
            .collect(),
    ))
}

#[derive(Serialize)]
pub struct VersionMeta {
    pub sha256: String,
}

#[derive(Serialize)]
pub struct LatestVersion {
    pub version: String,
    pub sha256: String,
}

async fn load_package_document(pool: &PgPool, name: &str) -> Result<serde_json::Value, AppError> {
    let pkg = db::packages::get_package(pool, name)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    let latest_ver = pkg.latest_version.clone().ok_or_else(|| {
        AppError::Internal(format!(
            "Package {} is missing latest version metadata",
            name
        ))
    })?;

    let ver = db::packages::get_version(pool, name, &latest_ver)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| {
            AppError::Internal(format!(
                "Package {} latest version {} is missing version metadata",
                name, latest_ver
            ))
        })?;

    Ok(serde_json::json!({
        "name": pkg.name,
        "description": pkg.description,
        "owner": pkg.owner_login,
        "download_count": pkg.download_count,
        "latest": {
            "version": ver.version,
            "sha256": ver.sha256,
        },
        "readme": ver.readme,
    }))
}

/// GET /api/v1/packages/{owner}/{package}/{version}
/// Returns {"sha256": "..."} — used by meshpkg install to verify
pub async fn version_handler(
    State(state): State<Arc<AppState>>,
    Path((owner, package, version)): Path<(String, String, String)>,
) -> Result<Json<VersionMeta>, AppError> {
    let name = format!("{}/{}", owner, package);
    let ver = db::packages::get_version(&state.pool, &name, &version)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(VersionMeta { sha256: ver.sha256 }))
}

/// GET /api/v1/packages/{owner}/{package}
/// Returns {latest: {version, sha256}, readme, description, owner, download_count}
/// meshpkg install <name> uses .latest.version and .latest.sha256
/// Website PackagePage.vue uses .readme for README rendering (REG-04)
pub async fn package_handler(
    State(state): State<Arc<AppState>>,
    Path((owner, package)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppError> {
    let name = format!("{}/{}", owner, package);
    Ok(Json(load_package_document(&state.pool, &name).await?))
}

#[cfg(test)]
mod tests {
    use super::load_package_document;
    use crate::{db, error::AppError};
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
    async fn package_document_uses_highest_latest_version(pool: PgPool) -> sqlx::Result<()> {
        let user_id = insert_user(&pool, "snowdamiz").await?;
        let package_name = "snowdamiz/mesh-proof";
        let newer = "0.34.0-20260327191246-2503";
        let older = "0.34.0-20260327191241-2432";

        db::packages::insert_version(
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

        db::packages::insert_version(
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

        let payload = load_package_document(&pool, package_name)
            .await
            .expect("package metadata should load");
        assert_eq!(payload["latest"]["version"], newer);
        assert_eq!(payload["latest"]["sha256"], "sha-new");
        assert_eq!(payload["description"], "refreshed package description");
        assert_eq!(payload["readme"], "# newer readme");

        Ok(())
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn package_document_fails_when_latest_version_row_is_missing(
        pool: PgPool,
    ) -> sqlx::Result<()> {
        sqlx::query(
            r#"
            INSERT INTO packages (name, owner_login, description, latest_version)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind("snowdamiz/mesh-proof")
        .bind("snowdamiz")
        .bind("description")
        .bind("0.34.0-20260327191246-2503")
        .execute(&pool)
        .await?;

        let error = load_package_document(&pool, "snowdamiz/mesh-proof")
            .await
            .expect_err("missing version row should be explicit");

        match error {
            AppError::Internal(message) => {
                assert!(message.contains("missing version metadata"));
            }
            other => panic!("expected internal error, got {other:?}"),
        }

        Ok(())
    }
}
