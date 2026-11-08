import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { startSync } from "./lib/sync";
import { startPhoneBridge } from "./lib/phone";
import { setWakeHandler, startVoice } from "./lib/wake";
import { handleWake } from "./components/Assistant";
import { notify, startTraySetting } from "./lib/platform";
import { startReplyWatcher } from "./lib/invites";
import { startUpdateChecks } from "./lib/updates";

startSync();
startPhoneBridge();
setWakeHandler(handleWake);
startVoice();
startTraySetting();
startReplyWatcher(notify);
startUpdateChecks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
