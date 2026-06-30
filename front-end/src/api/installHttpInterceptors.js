import axios from "axios";
import { clearAuthSession, getAuthToken } from "./auth";
import { getApiBase } from "./client";

let installed = false;
let trialExpiredEmitted = false;

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location?.pathname === "/login") return;
  window.location.href = "/login";
}

function emitTrialExpired(detail) {
  if (trialExpiredEmitted) return;
  trialExpiredEmitted = true;
  window.dispatchEvent(
    new CustomEvent("trial-expired", {
      detail: detail ?? {
        title: "Trial Period Ended",
        message: "This is a trial application. The trial period has ended.",
      },
    })
  );
}

function isTrialExpiredPayload(payload) {
  if (!payload) return false;
  if (payload.code === "TRIAL_EXPIRED") return true;
  if (payload.detail === "Trial expired") return true;
  if (typeof payload.message === "string" && payload.message.toLowerCase().includes("trial")) return true;
  return false;
}

export function installHttpInterceptors() {
  if (installed) return;
  installed = true;

  const LOCAL_ONLY_PATHS = ["/api/config", "/api/health", "/api/setup", "/api/discover", "/shutdown"];

  const getFullUrl = (url) => {
    if (!url) return url;

    // Normalize URL: Strip localhost prefixes so they are treated as relative paths
    let path = url;
    if (url.startsWith("http://localhost:8000")) path = url.replace("http://localhost:8000", "");
    else if (url.startsWith("http://127.0.0.1:8000")) path = url.replace("http://127.0.0.1:8000", "");

    if (!path.startsWith("/")) return url;

    // 1. If it's a local configuration path, force it to localhost:8000
    if (LOCAL_ONLY_PATHS.some((p) => path.startsWith(p))) {
      return `http://localhost:8000${path}`;
    }

    // 2. Otherwise, check if we have a remote Server IP configured
    const base = getApiBase();
    if (base && !base.includes("localhost") && !base.includes("127.0.0.1")) {
      return `${base.replace(/\/$/, "")}${path}`;
    }

    // 3. Fallback: hit the local backend on port 8000
    return `http://localhost:8000${path}`;
  };

  axios.interceptors.request.use((config) => {
    // Rewrite URL for Pure Client Architecture
    config.url = getFullUrl(config.url);

    if (config.data) {
      console.log(`[API BODY SENT] to ${config.url}:`, config.data);
    }

    const token = getAuthToken();
    if (!token) return config;

    const headers = config.headers ?? {};
    if (typeof headers.set === "function") {
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    } else if (!headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    config.headers = headers;
    return config;
  });

  axios.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 401) {
        clearAuthSession();
        redirectToLogin();
      }
      if (status === 403 && isTrialExpiredPayload(data)) {
        emitTrialExpired({
          title: "Trial Period Ended",
          message: data?.message || "This is a trial application. The trial period has ended.",
        });
      }
      return Promise.reject(err);
    }
  );

  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const token = getAuthToken();
      let nextInput = args[0];
      let nextInit = args[1];

      // Rewrite URL for Pure Client Architecture
      if (typeof nextInput === "string") {
        nextInput = getFullUrl(nextInput);
      } else if (nextInput instanceof Request) {
        // For Request objects, we might need a more complex cloning/updating logic,
        // but since most app calls use strings, we focus on strings first.
      }

      if (token) {
        const init = nextInit || {};
        const headers = new Headers(init.headers || (nextInput instanceof Request ? nextInput.headers : undefined));
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        nextInit = { ...init, headers };
        if (nextInput instanceof Request) nextInput = new Request(nextInput, nextInit);
      }

      const res =
        nextInput instanceof Request ? await originalFetch(nextInput) : await originalFetch(nextInput, nextInit);

      if (res?.status === 403) {
        let data;
        try {
          data = await res.clone().json();
        } catch {
          data = null;
        }

        if (isTrialExpiredPayload(data)) {
          emitTrialExpired({
            title: "Trial Period Ended",
            message: data?.message || "This is a trial application. The trial period has ended.",
          });
          throw new Error("TRIAL_EXPIRED");
        }
      }

      if (res?.status === 401) {
        clearAuthSession();
        redirectToLogin();
      }
      return res;
    };
  }
}
