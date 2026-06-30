export const AUTH_TOKEN_KEY = "authToken";
export const AUTH_USER_KEY = "user";
export const AUTH_LEGACY_FLAG_KEY = "isAuthenticated";

export function getAuthToken() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser() {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getUserRole() {
  const user = getStoredUser();
  return user?.role || null;
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function setAuthSession({ token, user }) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_LEGACY_FLAG_KEY, "true");
}

export function clearAuthSession() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_LEGACY_FLAG_KEY);
}

