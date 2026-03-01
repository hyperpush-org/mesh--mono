#[derive(Clone, Debug)]
pub struct AppConfig {
    pub database_url: String,
    pub storage_endpoint: String,
    pub storage_bucket: String,
    pub storage_access_key_id: String,
    pub storage_secret_access_key: String,
    pub storage_region: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub callback_url: String,
    pub session_secret: String,
    pub port: u16,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, String> {
        Ok(Self {
            database_url: env("DATABASE_URL")?,
            storage_endpoint: env("STORAGE_ENDPOINT")?,
            storage_bucket: env("STORAGE_BUCKET")?,
            storage_access_key_id: env("STORAGE_ACCESS_KEY_ID")?,
            storage_secret_access_key: env("STORAGE_SECRET_ACCESS_KEY")?,
            storage_region: env_or("STORAGE_REGION", "auto"),
            github_client_id: env("GITHUB_CLIENT_ID")?,
            github_client_secret: env("GITHUB_CLIENT_SECRET")?,
            callback_url: env("GITHUB_CALLBACK_URL")?,
            session_secret: env("SESSION_SECRET")?,
            port: env_or("PORT", "3000").parse().unwrap_or(3000),
        })
    }
}

fn env(key: &str) -> Result<String, String> {
    std::env::var(key).map_err(|_| format!("Missing env var: {}", key))
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
