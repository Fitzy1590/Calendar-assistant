import { describe, expect, it } from "vitest";
import { chooseDownload, newer } from "./updates";

describe("version compare", () => {
  it("compares x.y.z numerically", () => {
    expect(newer("0.2.0", "0.1.9")).toBe(true);
    expect(newer("v0.10.0", "0.9.0")).toBe(true);
    expect(newer("0.1.0", "0.1.0")).toBe(false);
    expect(newer("0.1.0", "0.2.0")).toBe(false);
  });
});

describe("choosing how to install a release", () => {
  const sha = "sha256:" + "a".repeat(64);
  const rel = {
    html_url: "https://github.com/x/y/releases/tag/v1",
    assets: [
      { name: "App_1_x64_en-US.msi", browser_download_url: "https://example/msi", digest: sha },
      { name: "App_1_x64-setup.exe", browser_download_url: "https://example/exe", digest: sha },
      { name: "App-test-signed.apk", browser_download_url: "https://example/apk" },
    ],
  };
  it("Windows downloads the installer itself, with GitHub's checksum", () => {
    expect(chooseDownload(rel, false)).toEqual({ via: "installer", url: "https://example/exe", sha256: sha });
  });
  it("Windows won't install a file GitHub published no checksum for", () => {
    const noSum = { ...rel, assets: [{ name: "App-setup.exe", browser_download_url: "https://example/exe" }] };
    expect(chooseDownload(noSum, false)).toEqual({ via: "page", url: rel.html_url });
    const bad = { ...rel, assets: [{ name: "App-setup.exe", browser_download_url: "https://example/exe", digest: "sha256:zz" }] };
    expect(chooseDownload(bad, false).via).toBe("page");
  });
  it("Android gets the APK, and a release without one opens the page", () => {
    expect(chooseDownload(rel, true)).toEqual({ via: "apk", url: "https://example/apk" });
    expect(chooseDownload({ html_url: rel.html_url, assets: [] }, true).via).toBe("page");
  });
});
