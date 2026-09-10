import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// App.jsx still renders the legacy email-shaped control. Convert it once after
// React mounts it. Do not keep observing/re-writing the input attributes while
// the user types, because changing an input's type can reset its caret and make
// characters appear in reverse order.
function installWavoLoginFieldCompat() {
  const makeUsernameField = () => {
    const input = document.querySelector('.login-card input[autocomplete="email"], .login-card input[data-wavo-login]');
    if (!input) return false;

    input.type = "text";
    input.autocomplete = "username";
    input.placeholder = "Username";
    input.dataset.wavoLogin = "true";

    const label = input.closest("label");
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) {
      label.firstChild.nodeValue = "Username";
    }

    const form = input.closest("form");
    if (form) form.noValidate = true;
    return true;
  };

  if (makeUsernameField()) return;

  const observer = new MutationObserver(() => {
    if (makeUsernameField()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

installWavoLoginFieldCompat();
