use std::sync::Arc;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use crate::{db, error::AppError, state::AppState};

#[derive(Deserialize)]
pub struct SearchParams {
    pub search: Option<String>,
}

#[derive(Serialize)]
pub struct PackageListItem {
    pub name: String,
    pub version: String,
    pub description: String,
}

pub async fn handler(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<PackageListItem>>, AppError> {
    if let Some(ref q) = params.search {
        if !q.is_empty() {
            // FTS search via tsvector
            let results = db::packages::search_packages(&state.pool, q)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            return Ok(Json(results.into_iter().map(|r| PackageListItem {
                name: r.name,
                version: r.version,
                description: r.description,
            }).collect()));
        }
    }

    // No search query — return all packages sorted by downloads/recency
    let rows = db::packages::list_packages(&state.pool, 100, 0)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(rows.into_iter().map(|r| PackageListItem {
        name: r.name,
        version: r.latest_version.unwrap_or_default(),
        description: r.description,
    }).collect()))
}
