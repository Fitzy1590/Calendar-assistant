import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { startSync } from "./lib/sync";
import { startPhoneBridge } from "./lib/phone";
import { setWakeHandler, startVoice } from "./lib/wake";
import { handleWake } from "./components/Assistant";
import { startTraySetting } from "./lib/platform";

startSync();
startPhoneBridge();
setWakeHandler(handleWake);
startVoice();
startTraySetting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
