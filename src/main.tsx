import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { startSync } from "./lib/sync";
import { startPhoneBridge } from "./lib/phone";

startSync();
startPhoneBridge();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
