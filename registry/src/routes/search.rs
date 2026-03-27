use crate::{db, error::AppError, state::AppState};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Deserialize)]
pub struct SearchParams {
    pub search: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct PackageListItem {
    pub name: String,
    pub version: String,
    pub description: String,
}

async fn load_package_list(
    pool: &PgPool,
    search: Option<&str>,
) -> Result<Vec<PackageListItem>, AppError> {
    if let Some(query) = search {
        if !query.is_empty() {
            let results = db::packages::search_packages(pool, query)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;

            return results
                .into_iter()
                .map(|result| {
                    let version = result.version.ok_or_else(|| {
                        AppError::Internal(format!(
                            "Search result for package {} is missing latest version metadata",
                            result.name
                        ))
                    })?;

                    Ok(PackageListItem {
                        name: result.name,
                        version,
                        description: result.description,
                    })
                })
                .collect();
        }
    }

    let rows = db::packages::list_packages(pool, 100, 0)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    rows.into_iter()
        .map(|row| {
            let version = row.latest_version.ok_or_else(|| {
                AppError::Internal(format!(
                    "Package {} is missing latest version metadata",
                    row.name
                ))
            })?;

            Ok(PackageListItem {
                name: row.name,
                version,
                description: row.description,
            })
        })
        .collect()
}

pub async fn handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<PackageListItem>>, AppError> {
    Ok(Json(
        load_package_list(&state.pool, params.search.as_deref()).await?,
    ))
}

#[cfg(test)]
mod tests {
    use super::{load_package_list, PackageListItem};
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
    async fn package_list_and_search_share_monotonic_latest_version(
        pool: PgPool,
    ) -> sqlx::Result<()> {
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
            None,
            "mesh proof package",
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
            None,
            "mesh proof package refreshed",
            "snowdamiz",
            user_id,
        )
        .await?;

        let list = load_package_list(&pool, None)
            .await
            .expect("package index should load");
        assert_eq!(
            list,
            vec![PackageListItem {
                name: package_name.to_string(),
                version: newer.to_string(),
                description: "mesh proof package refreshed".to_string(),
            }]
        );

        let search = load_package_list(&pool, Some("proof"))
            .await
            .expect("package search should load");
        assert_eq!(
            search,
            vec![PackageListItem {
                name: package_name.to_string(),
                version: newer.to_string(),
                description: "mesh proof package refreshed".to_string(),
            }]
        );

        Ok(())
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn package_list_and_search_fail_when_latest_join_is_missing(
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
        .bind("mesh proof package")
        .bind("0.34.0-20260327191246-2503")
        .execute(&pool)
        .await?;

        let list_error = load_package_list(&pool, None)
            .await
            .expect_err("missing latest join should fail list endpoint");
        match list_error {
            AppError::Internal(message) => {
                assert!(message.contains("missing latest version metadata"));
            }
            other => panic!("expected internal error, got {other:?}"),
        }

        let search_error = load_package_list(&pool, Some("proof"))
            .await
            .expect_err("missing latest join should fail search endpoint");
        match search_error {
            AppError::Internal(message) => {
                assert!(message.contains("missing latest version metadata"));
            }
            other => panic!("expected internal error, got {other:?}"),
        }

        Ok(())
    }
}
