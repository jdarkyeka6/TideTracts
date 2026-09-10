import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Wavo users sign in with a username. The underlying auth layer still accepts
// either a username or an email, but the UI should match the normal Wavo flow.
function installWavoLoginFieldCompat() {
  const update = () => {
    const input = document.querySelector('.login-card input[autocomplete="email"], .login-card input[data-wavo-login]');
    if (!input) return;
    input.type = "text";
    input.autocomplete = "username";
    input.placeholder = "Username";
    input.dataset.wavoLogin = "true";

    const label = input.closest("label");
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) {
      label.firstChild.nodeValue = "Username";
    }
  };

  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  update();
}

installWavoLoginFieldCompat();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
