//! Microsoft's token step, run natively. The web view's HTTP client adds an `Origin` header, and Microsoft treats a request
//! with one as a cross-origin browser call (error AADSTS90023) for a desktop app. A native request has none.

use std::collections::HashMap;
use tauri_plugin_http::reqwest;

/// Only this endpoint, so the command can't be used to POST anywhere else.
const MS_TOKEN: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_DEVICE: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode";

async fn post_form(url: &str, form: &HashMap<String, String>) -> Result<(u16, String), String> {
    let resp = reqwest::Client::new()
        .post(url)
        .header("User-Agent", "CalendarAssistant")
        .form(form)
        .send()
        .await
        .map_err(|e| format!("Couldn't reach Microsoft: {e}"))?;
    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Couldn't read Microsoft's answer: {e}"))?;
    Ok((status, body))
}

/// Android sign-in step 1: ask Microsoft for a code to show the person.
#[tauri::command]
pub async fn ms_device_code(form: HashMap<String, String>) -> Result<(u16, String), String> {
    post_form(MS_DEVICE, &form).await
}

#[tauri::command]
pub async fn ms_token_request(form: HashMap<String, String>) -> Result<(u16, String), String> {
    post_form(MS_TOKEN, &form).await
}
