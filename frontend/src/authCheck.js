// src/authCheck.js

export async function checkAuth() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname.includes("localhost") || hostname.includes("127.");

  // Flask backend
  const apiBase = isLocal
    ? "http://localhost:8000/api"
    : "https://mtmbackend-production.up.railway.app/api";

  // Main portal for login
  const portalBase = isLocal
    ? "http://localhost:5173"
    : "https://www.mtmgroup.agency";

  try {
    const res = await fetch(`${apiBase}/auth/me`, {
      credentials: "include", // include cookies/JWT from master app
    });

    if (!res.ok) {
      const current = encodeURIComponent(window.location.href);
      window.location.href = `${portalBase}/signin?redirect=${current}`;
      return false;
    }

    const user = await res.json();

    console.log("✅ Authenticated user:", user);

    return {
      authorized: true,

      // your backend returns: id
      userId: user.id,

      // backend returns: first_name, last_name
      firstName: user.first_name,
      lastName: user.last_name,

      email: user.email || "",

      // backend returns: is_admin = 1 or 0
      isAdmin: user.is_admin === 1 || user.is_admin === "1",
      canUpdateData: user.can_update_data === 1 || user.can_update_data === "1",
    };

  } catch (err) {
    console.error("❌ Auth check failed:", err);
    const current = encodeURIComponent(window.location.href);
    window.location.href = `${portalBase}/signin?redirect=${current}`;
    return false;
  }
}
