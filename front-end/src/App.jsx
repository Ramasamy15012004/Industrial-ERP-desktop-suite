import React, { useEffect, useMemo, useState } from "react";
import { RouterProvider } from 'react-router-dom';
import router from './router';
import './index.css';
import { installHttpInterceptors } from "./api/installHttpInterceptors";
import { getConfig, getHealth } from "./api/setup";
import { setApiBase } from "./api/client";
import SetupWizard from "./pages/SetupWizard";

installHttpInterceptors();

function App() {
  const [config, setConfig] = useState(null); // { configured: bool }
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trialExpired, setTrialExpired] = useState(null);

  const checkConfig = async () => {
    setLoading(true);
    let lastErr = null;
    // Retry up to 5 times — backend exe may still be booting when UI opens
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [cfg, h] = await Promise.all([getConfig(), getHealth()]);

        // Pure Client Architecture:
        // If we are a client, all future BUSINESS/AUTH calls go to the Server's IP.
        // BUT: getConfig/getHealth/Setup always stay on localhost for this machine's config.
        if (cfg && cfg.mode === 'client' && cfg.server_ip) {
          setApiBase(cfg.server_ip);
        }

        setConfig(cfg);
        setHealth(h);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        // Wait 1.5s before next attempt
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    console.error("Failed to check config after retries", lastErr);
    setLoading(false);
  };

  useEffect(() => {
    checkConfig();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      setTrialExpired(e?.detail || { title: "Trial Period Ended" });
    };
    window.addEventListener("trial-expired", handler);
    return () => window.removeEventListener("trial-expired", handler);
  }, []);

  const modal = useMemo(() => {
    if (!trialExpired) return null;
    const title = trialExpired.title || "Trial Period Ended";
    const message =
      trialExpired.message ||
      "This is a trial application. The trial period has ended. Please contact support.";

    return (
      <div
        className="blur-overlay"
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 16,
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            background: "#fff",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 10px 35px rgba(0,0,0,0.25)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "#333" }}>{message}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
            You can’t continue using the app after the trial ends.
          </div>
        </div>
      </div>
    );
  }, [trialExpired]);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div className="loading-spinner">Initializing System...</div>
      </div>
    );
  }

  // Gate the app with the Setup Wizard if not configured
  if (!config || !config.configured) {
    return <SetupWizard initialHealth={health} onConfigured={checkConfig} />;
  }

  return (
    <>
      <RouterProvider router={router} />
      {modal}
    </>
  );
}

export default App;
