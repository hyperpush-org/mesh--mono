use std::sync::Arc;
use axum::Router;
use crate::state::AppState;

pub mod auth;
pub mod download;
pub mod metadata;
pub mod publish;
pub mod search;

pub fn router(_state: Arc<AppState>) -> Router {
    Router::new()
}
