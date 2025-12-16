// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { BrowserRouter } from "react-router-dom";
import { checkAuth } from "./authCheck"; // 🔒 authorization check

// 🧠 Immediately show white screen + small message
document.body.style.margin = "0";
document.body.innerHTML = `
  <div id="pre-auth-screen"
    style="
      display:flex;
      align-items:center;
      justify-content:center;
      height:100vh;
      background:white;
      color:#3bb9af;
      font-family:Arial, sans-serif;
      font-size:18px;
      letter-spacing:0.5px;
    ">
    Authorization Processing...
  </div>
`;

async function startApp() {
  const result = await checkAuth();
  if (!result) return; // redirect handled inside checkAuth

  let authPayload = {};

  // Support both old (boolean) and new (object) / raw user styles:
  if (typeof result === "object") {
    // Accept either { authorized, userId, firstName, lastName, isAdmin }
    // or raw user { id, first_name, last_name, is_admin }
    const {
      authorized,
      userId,
      id,
      firstName,
      first_name,
      lastName,
      last_name,
      isAdmin,
      is_admin,
    } = result;
    if (authorized === false) return;

    authPayload = {
      userId: userId || id || result.id || "",
      firstName: firstName || result.firstName || first_name || "",
      lastName: lastName || result.lastName || last_name || "",
      isAdmin: !!(isAdmin || result.isAdmin || is_admin),
    };
  }

  // Helpful debug for environments where auth shape varies
  console.log("🌟 Auth payload:", authPayload);

  if (typeof window !== "undefined") {
    window.__AUTH__ = authPayload; // 🌟 used by FinalPlan & History
  }

  // 🧹 Clear pre-auth screen
  document.body.innerHTML = `<div id="root"></div>`;

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );

  reportWebVitals();
}

startApp();