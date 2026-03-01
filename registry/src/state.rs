use std::sync::Arc;
use sqlx::PgPool;
use crate::config::AppConfig;
use crate::storage::r2::R2Client;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub s3: R2Client,
    pub config: Arc<AppConfig>,
    pub oauth_client: Arc<oauth2::basic::BasicClient>,
}
