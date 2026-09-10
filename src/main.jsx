import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./text-field-drag.css";
import "./text-field-drag.js";

// Creator-side field drag/resize helpers load before React mounts.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
