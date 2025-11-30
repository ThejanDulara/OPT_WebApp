// src/authCheck.js

export async function checkAuth() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname.includes("localhost") || hostname.includes("127.");

  // Flask backend
  const apiBase = isLocal
    ? "http://localhost:8000"
    : "https://tsmbackend-production.up.railway.app";

  // Main portal for login
  const portalBase = isLocal
    ? "http://localhost:5173"
    : "https://www.thirdshiftmedia.agency";

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

    // 🟢 Return full user object
    return {
      authorized: true,
      userId: user.id || user.userId || "",
      firstName: user.firstName || user.firstname || "",
      lastName: user.lastName || user.lastname || "",
      email: user.email || "",
      role: user.role || "user",
      isAdmin:
        user.role === "admin" ||
        user.role === "superadmin" ||
        user.isAdmin === true,
    };
  } catch (err) {
    console.error("❌ Auth check failed:", err);
    const current = encodeURIComponent(window.location.href);
    window.location.href = `${portalBase}/signin?redirect=${current}`;
    return false;
  }
}
