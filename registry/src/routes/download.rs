use std::sync::Arc;
use axum::{
    body::Body,
    extract::{Path, State},
    response::Response,
    http::header,
};
use tokio_util::io::ReaderStream;
use crate::{db, error::AppError, state::AppState};

pub async fn handler(
    State(state): State<Arc<AppState>>,
    Path((name, version)): Path<(String, String)>,
) -> Result<Response, AppError> {
    // Get version record (for sha256 key)
    let ver = db::packages::get_version(&state.pool, &name, &version)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    // Increment download counter
    db::packages::increment_download(&state.pool, &name, &version)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Fetch from R2 and stream — do NOT buffer full body
    let s3_resp = state.s3.get_object(&ver.sha256).await
        .map_err(|_| AppError::NotFound)?;

    let stream = s3_resp.body.into_async_read();
    let body = Body::from_stream(ReaderStream::new(stream));

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}-{}.tar.gz\"",
                name.replace('/', "-"), version),
        )
        .body(body)
        .unwrap())
}
