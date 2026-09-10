import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// TideTracts uses the same username-first login flow as Wavo. App.jsx still
// renders the legacy email control, so keep the live DOM aligned with the
// actual auth behaviour until that component is folded into the next cleanup.
function installWavoLoginFieldCompat() {
  let scheduled = false;

  const update = () => {
    scheduled = false;
    const input = document.querySelector('.login-card input[autocomplete="email"], .login-card input[data-wavo-login]');
    if (!input) return;

    if (input.type !== "text") input.type = "text";
    if (input.autocomplete !== "username") input.autocomplete = "username";
    if (input.placeholder !== "Username") input.placeholder = "Username";
    if (input.dataset.wavoLogin !== "true") input.dataset.wavoLogin = "true";

    const label = input.closest("label");
    if (label?.firstChild?.nodeType === Node.TEXT_NODE && label.firstChild.nodeValue !== "Username") {
      label.firstChild.nodeValue = "Username";
    }

    const form = input.closest("form");
    if (form && !form.noValidate) form.noValidate = true;
  };

  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(update);
  };

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["type", "autocomplete", "placeholder", "data-wavo-login", "novalidate"],
  });

  scheduleUpdate();
}

installWavoLoginFieldCompat();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
