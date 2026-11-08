//! Diagnose and repair Microsoft Edge WebView2 on Windows.
//!
//! "Debloat" and privacy scripts commonly break WebView2 in three ways; we look for each:
//!   * uninstalling it
//!   * blocking msedgewebview2.exe from starting ("Image File Execution Options" Debugger trick)
//!   * a policy that stops Microsoft's updater from installing it again (EdgeUpdate Install… = 0),
//!     sometimes with the Edge update services disabled
//! The repair only undoes the WebView2-specific blocks (the debloater's Edge-browser choices stay), then
//! installs WebView2 from Microsoft. It runs as one PowerShell script with a single Windows admin prompt.

use std::path::PathBuf;
use std::process::Command;

/// WebView2 Runtime's id in Microsoft's updater.
const WEBVIEW2_APP_ID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const IFEO: &str = r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\msedgewebview2.exe";
const POLICY: [&str; 2] = [
    r"HKLM\SOFTWARE\Policies\Microsoft\EdgeUpdate",
    r"HKLM\SOFTWARE\WOW6432Node\Policies\Microsoft\EdgeUpdate",
];
const INSTALL_KEYS: [&str; 2] = [
    r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
];

#[derive(Debug, Default, Clone)]
pub struct Findings {
    pub installed_version: Option<String>,
    /// msedgewebview2.exe is redirected so it can't start
    pub blocked_from_running: bool,
    /// a policy stops WebView2 being (re)installed
    pub install_blocked_by_policy: bool,
    /// Microsoft's updater services are disabled (the installer needs them)
    pub updater_disabled: bool,
}

impl Findings {
    /// Plain-English list of what's wrong, one line each.
    pub fn summary(&self) -> String {
        let mut out = Vec::new();
        match &self.installed_version {
            None => out.push("• WebView2 isn't installed on this PC.".to_string()),
            Some(v) => out.push(format!("• WebView2 {v} is installed.")),
        }
        if self.blocked_from_running {
            out.push("• A clean-up or \"debloat\" tool has blocked WebView2 from starting.".into());
        }
        if self.install_blocked_by_policy {
            out.push(
                "• A Windows policy (often set by a debloat tool) stops WebView2 being installed."
                    .into(),
            );
        }
        if self.updater_disabled {
            out.push(
                "• Microsoft's updater, which installs WebView2, has been switched off.".into(),
            );
        }
        if out.len() == 1 && self.installed_version.is_some() {
            out.push(
                "• No blocks found; WebView2 may be damaged. Reinstalling it usually fixes this."
                    .into(),
            );
        }
        out.join("\n")
    }
}

/// Run a console program without flashing a window.
fn quiet(cmd: &str, args: &[&str]) -> Option<String> {
    let mut c = Command::new(cmd);
    c.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = c.output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

fn reg_value(key: &str, name: &str) -> Option<String> {
    let out = quiet("reg", &["query", key, "/v", name])?;
    // "    pv    REG_SZ    131.0.2903.70"
    out.lines()
        .find(|l| l.trim_start().starts_with(name))
        .and_then(|l| l.split_whitespace().last())
        .map(|s| s.to_string())
}

fn service_disabled(name: &str) -> bool {
    quiet("sc", &["qc", name])
        .map(|o| o.contains("DISABLED"))
        .unwrap_or(false)
}

/// Quick check (one registry read) used at every start.
pub fn blocked_from_running() -> bool {
    reg_value(IFEO, "Debugger").is_some()
}

pub fn diagnose() -> Findings {
    let installed_version = INSTALL_KEYS
        .iter()
        .filter_map(|k| reg_value(k, "pv"))
        .find(|v| !v.is_empty() && v != "0.0.0.0")
        .or_else(|| tauri::webview_version().ok());
    let blocked_from_running = blocked_from_running();
    let install_blocked_by_policy = POLICY.iter().any(|k| {
        reg_value(k, &format!("Install{WEBVIEW2_APP_ID}")).as_deref() == Some("0x0")
            || (reg_value(k, &format!("Install{WEBVIEW2_APP_ID}")).is_none()
                && reg_value(k, "InstallDefault").as_deref() == Some("0x0"))
    });
    let updater_disabled = service_disabled("edgeupdate") || service_disabled("edgeupdatem");
    Findings {
        installed_version,
        blocked_from_running,
        install_blocked_by_policy,
        updater_disabled,
    }
}

/// The repair, as a PowerShell script. Only touches WebView2-specific settings.
pub fn repair_script(log: &str) -> String {
    format!(
        r#"$ErrorActionPreference = 'Continue'
Start-Transcript -Path '{log}' -Append | Out-Null
Write-Output 'Calendar Assistant: repairing Microsoft Edge WebView2'

# 1. Let msedgewebview2.exe start again (remove the "debugger" redirect a debloat tool added)
Remove-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\msedgewebview2.exe' -Name Debugger -ErrorAction SilentlyContinue

# 2. Allow WebView2 (only WebView2) to be installed; any block on the Edge browser itself stays as it is
foreach ($p in 'HKLM:\SOFTWARE\Policies\Microsoft\EdgeUpdate', 'HKLM:\SOFTWARE\WOW6432Node\Policies\Microsoft\EdgeUpdate') {{
  if (Test-Path $p) {{ Set-ItemProperty -Path $p -Name 'Install{id}' -Value 1 -Type DWord -ErrorAction SilentlyContinue }}
}}

# 3. Microsoft's updater services must be able to run for the installer to work
foreach ($s in 'edgeupdate', 'edgeupdatem') {{
  if (Get-Service $s -ErrorAction SilentlyContinue) {{ Set-Service $s -StartupType Manual -ErrorAction SilentlyContinue }}
}}

# 4. Install / repair WebView2 from Microsoft
$setup = Join-Path $env:TEMP 'MicrosoftEdgeWebview2Setup.exe'
try {{
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $setup -UseBasicParsing
  $p = Start-Process -FilePath $setup -ArgumentList '/silent', '/install' -Wait -PassThru
  Write-Output "WebView2 installer finished with code $($p.ExitCode)"
}} catch {{
  Write-Output "Download or install failed: $_"
  exit 2
}}
Stop-Transcript | Out-Null
"#,
        log = log.replace('\'', "''"),
        id = WEBVIEW2_APP_ID
    )
}

pub fn log_path() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("com.fitzy.calendarassistant")
        .join("crash-reports")
        .join("webview2-repair.log")
}

/// Run the repair with one admin prompt. Returns Ok(()) once WebView2 works.
pub fn repair() -> Result<(), String> {
    let log = log_path();
    if let Some(dir) = log.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let script = std::env::temp_dir().join("calendar-assistant-webview2-repair.ps1");
    std::fs::write(&script, repair_script(&log.to_string_lossy())).map_err(|e| e.to_string())?;
    // Start-Process -Verb RunAs shows Windows' admin prompt; -Wait blocks until the repair finishes.
    let inner = format!(
        "Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"{}\"'",
        script.to_string_lossy().replace('\'', "''")
    );
    let ok = quiet(
        "powershell.exe",
        &["-NoProfile", "-WindowStyle", "Hidden", "-Command", &inner],
    )
    .is_some();
    let _ = std::fs::remove_file(&script);
    if !ok {
        return Err("The repair was cancelled, or Windows didn't allow it to run.".into());
    }
    match tauri::webview_version() {
        Ok(_) if !diagnose().blocked_from_running => Ok(()),
        _ => Err(format!(
            "WebView2 still isn't working after the repair. A firewall or hosts-file block may be stopping the download. Details are in {}",
            log.display()
        )),
    }
}

/// Start a fresh copy of the app (after a successful repair).
pub fn relaunch() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = Command::new(exe).arg("--after-repair").spawn();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_lists_each_problem() {
        let f = Findings {
            installed_version: None,
            blocked_from_running: true,
            install_blocked_by_policy: true,
            updater_disabled: false,
        };
        let s = f.summary();
        assert!(
            s.contains("isn't installed")
                && s.contains("blocked WebView2 from starting")
                && s.contains("policy")
        );
    }

    #[test]
    fn script_only_allows_webview2_and_escapes_the_log_path() {
        let s = repair_script(r"C:\Users\O'Brien\log.txt");
        assert!(s.contains("Install{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"));
        assert!(!s.contains("InstallDefault")); // the Edge browser block is left alone
        assert!(s.contains("O''Brien"));
    }
}
