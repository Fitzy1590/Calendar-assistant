import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { startErrorCapture } from "./lib/errors";
import { ErrorBoundary } from "./components/Errors";
import { startSync } from "./lib/sync";
import { startPhoneBridge } from "./lib/phone";
import { setWakeHandler, startVoice } from "./lib/wake";
import { handleWake } from "./components/Assistant";
import { notify, startBrowserModeHeartbeat, startTraySetting } from "./lib/platform";
import { startReplyWatcher } from "./lib/invites";
import { startUpdateChecks } from "./lib/updates";
import { initStorage } from "./lib/sync/initStorage";
import { useStore } from "./store";

startErrorCapture(); // first, so problems during startup are explained too
await initStorage(); // Tauri: open SQLite and load the saved data before anything reads the store
startSync();
// real-time sync (Yjs + WebRTC) is loaded only once it is switched on, so it adds nothing to a normal start
let p2pLoaded = false;
const loadP2p = () => {
  if (p2pLoaded || !useStore.getState().settings.sync.p2p) return;
  p2pLoaded = true;
  import("./lib/sync/p2p").then((m) => m.startP2p());
};
loadP2p();
useStore.subscribe(loadP2p);
startPhoneBridge();
setWakeHandler(handleWake);
startVoice();
startTraySetting();
startBrowserModeHeartbeat();
startReplyWatcher(notify);
startUpdateChecks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary where="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
