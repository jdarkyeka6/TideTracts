import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// The original TideTracts login field was type=email, but Wavo users normally
// sign in with a username. Keep the login component small while making the
// rendered control accept both forms.
function installWavoLoginFieldCompat() {
  const update = () => {
    const input = document.querySelector('.login-card input[autocomplete="email"], .login-card input[data-wavo-login]');
    if (!input) return;
    input.type = "text";
    input.autocomplete = "username";
    input.placeholder = "Wavo username or email";
    input.dataset.wavoLogin = "true";

    const label = input.closest("label");
    if (label?.firstChild?.nodeType === Node.TEXT_NODE) {
      label.firstChild.nodeValue = "Wavo username or email";
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
