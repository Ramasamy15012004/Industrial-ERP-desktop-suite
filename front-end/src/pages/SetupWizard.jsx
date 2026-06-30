import React, { useEffect, useMemo, useRef, useState } from "react";
import { getConfig, getHealth, performSetup, discoverServers } from "../api/setup";
import { runDockerProfile, getDockerJob } from "../api/dockerControl";
import FormContainer from "../components/ui/FormContainer";
import FormInput from "../components/ui/FormInput";
import PrimaryButton from "../components/ui/PrimaryButton";
import SecondaryButton from "../components/ui/SecondaryButton";

function Field({ label, children, hint }) {
  return (
    <div className="form-field" style={{ marginBottom: 16 }}>
      <label className="form-label">{label}</label>
      {children}
      {hint ? <div className="text-secondary" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

export default function SetupWizard({ initialHealth, onConfigured }) {
  const suggestedServerIp = initialHealth?.local_ip || "";

  const [stage, setStage] = useState("mode"); // mode -> role -> form
  const [appMode, setAppMode] = useState(null); // "single" | "multi"
  const [role, setRole] = useState(null); // "server" | "client"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [dockerBusy, setDockerBusy] = useState(false);
  const [dockerOutput, setDockerOutput] = useState("");
  const [dockerJobId, setDockerJobId] = useState(null);
  const [dockerStatus, setDockerStatus] = useState("");
  const [dockerDone, setDockerDone] = useState(false);
  const terminalRef = useRef(null);

  const [singleForm, setSingleForm] = useState({
    db_host: "localhost",
    db_port: 5432,
    db_name: "production_db",
    db_user: "postgres",
    db_password: "",
    api_port: 8000,
  });

  const [serverForm, setServerForm] = useState({
    db_host: "localhost",
    db_port: 5432,
    db_name: "production_db",
    pg_admin_user: "postgres",
    pg_admin_password: "",
    server_ip: suggestedServerIp,
    api_port: 8000,
  });

  const [clientForm, setClientForm] = useState({
    server_ip: "",
    api_port: 8000,
    username: "",
    password: "",
  });

  const canBack = useMemo(() => stage !== "mode", [stage]);

  useEffect(() => {
    if (suggestedServerIp) {
      setServerForm((f) => ({ ...f, server_ip: suggestedServerIp }));
    }
  }, [suggestedServerIp]);

  const back = () => {
    setError("");
    setInfo("");
    if (stage === "form" && appMode === "multi") {
      setStage("role");
      return;
    }
    setStage("mode");
  };

  const submit = async (payload) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await performSetup(payload);
      if (res?.generated_db_password) {
        setInfo(`Server initialized successfully. Generated DB password: ${res.generated_db_password}`);
      }
      setTimeout(() => onConfigured?.(), res?.generated_db_password ? 5000 : 1000);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const runDocker = async (profile) => {
    setDockerBusy(true);
    setDockerDone(false);
    setError("");
    setInfo("");
    setDockerOutput("");
    setDockerStatus("queued");
    try {
      const data = await runDockerProfile(profile);
      setDockerJobId(data?.job_id || null);
      setInfo("Docker build started. Live output will appear below.");
    } catch (e) {
      setDockerOutput(e.message || "Docker build failed.");
      setError("Docker build failed. Please check the output below.");
    } finally {
      setDockerBusy(false);
    }
  };

  useEffect(() => {
    if (!dockerJobId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const data = await getDockerJob(dockerJobId);
        const job = data?.job;
        if (!job) return;
        setDockerStatus(job.status || "");
        setDockerOutput(job.log || "");
        if (job.status === "finished") {
          if (job.exit_code === 0) {
            setInfo("Docker build completed successfully.");
            setDockerDone(true);
          } else {
            setError("Docker build failed. Please check the output below.");
          }
          return;
        }
        if (job.status === "failed") {
          setError("Docker build failed. Please check the output below.");
          return;
        }
        if (!stopped) {
          setTimeout(poll, 1000);
        }
      } catch (e) {
        setError(e.message || "Docker status failed.");
      }
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [dockerJobId]);

  // Auto-scroll terminal to bottom on new output
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [dockerOutput]);

  const dockerProfile = useMemo(() => {
    if (appMode === "single") return "single";
    if (appMode === "multi" && role === "server") return "server";
    if (appMode === "multi" && role === "client") return "client";
    return null;
  }, [appMode, role]);

  const discover = async () => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const data = await discoverServers();
      const first = data?.items?.[0]?.ip;
      if (first) {
        setClientForm((f) => ({ ...f, server_ip: first }));
        setInfo(`Found server at ${first}`);
      } else {
        setInfo("No servers found on LAN. Please enter the IP manually.");
      }
    } catch (e) {
      setError(e.message || "Discovery failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-wizard-overlay">
      <div className="setup-wizard-card">
        <div className="setup-header">
          <h2 style={{ margin: 0 }}>System Setup Wizard</h2>
          <p className="text-secondary" style={{ marginTop: 8 }}>
            Configure your Production & Inventory System deployment.
          </p>
        </div>

        {info && <div className="notice-box" style={{ backgroundColor: '#e7f3ff', color: '#0066cc', padding: 12, borderRadius: 8, marginBottom: 16 }}>{info}</div>}
        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        {stage === "mode" && (
          <div className="setup-grid">
            <button
              className={`setup-choice ${appMode === "single" ? "active" : ""}`}
              onClick={() => {
                setAppMode("single");
                setStage("form");
              }}
              disabled={busy}
            >
              <div className="choice-title">Single Machine</div>
              <div className="choice-desc">All-in-one setup. Database and Application on this computer.</div>
            </button>

            <button
              className={`setup-choice ${appMode === "multi" ? "active" : ""}`}
              onClick={() => {
                setAppMode("multi");
                setStage("role");
              }}
              disabled={busy}
            >
              <div className="choice-title">Network / Multi-User</div>
              <div className="choice-desc">Central server hosts the database; other PCs connect as clients.</div>
            </button>
          </div>
        )}

        {stage === "role" && (
          <div>
            <h3 className="section-title small">Select This PC's Role</h3>
            <div className="setup-grid">
              <button
                className={`setup-choice ${role === "server" ? "active" : ""}`}
                onClick={() => {
                  setRole("server");
                  setStage("form");
                }}
                disabled={busy}
              >
                <div className="choice-title">Server Host</div>
                <div className="choice-desc">This PC will host the database and the central API.</div>
              </button>
              <button
                className={`setup-choice ${role === "client" ? "active" : ""}`}
                onClick={() => {
                  setRole("client");
                  setStage("form");
                }}
                disabled={busy}
              >
                <div className="choice-title">Client Node</div>
                <div className="choice-desc">This PC will connect to a Server PC on the network.</div>
              </button>
            </div>
          </div>
        )}

        {stage === "form" && appMode === "single" && (
          <FormContainer>
            <h3 className="section-title small">Single Machine Configuration</h3>
            <div className="form-grid">
              <Field label="PostgreSQL Username">
                <input
                  className="form-control"
                  value={singleForm.db_user}
                  onChange={(e) => setSingleForm((f) => ({ ...f, db_user: e.target.value }))}
                  placeholder="postgres"
                />
              </Field>
              <Field label="PostgreSQL Password" hint="This is your main PostgreSQL/PGAdmin password. It will be used to initialize the database if it doesn't exist.">
                <input
                  className="form-control"
                  type="password"
                  value={singleForm.db_password}
                  onChange={(e) => setSingleForm((f) => ({ ...f, db_password: e.target.value }))}
                  placeholder="password"
                />
              </Field>
              <Field label="Database Name" hint="Choose any name. If it's new, it will be automatically created.">
                <input
                  className="form-control"
                  value={singleForm.db_name}
                  onChange={(e) => setSingleForm((f) => ({ ...f, db_name: e.target.value }))}
                  placeholder="production_db"
                />
              </Field>
            </div>
            <div className="form-actions" style={{ marginTop: 24 }}>
              <SecondaryButton onClick={() => runDocker("single")} disabled={dockerBusy}>
                {dockerBusy ? "Building..." : "Build & Start (Docker)"}
              </SecondaryButton>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <PrimaryButton onClick={() => submit({ mode: "single", ...singleForm })} disabled={busy || !dockerDone}>
                  {busy ? "Applying..." : "Complete Setup"}
                </PrimaryButton>
                {!dockerDone && (
                  <span style={{ fontSize: 11, color: '#f59e0b' }}>
                    ⚠ Run "Build & Start (Docker)" first
                  </span>
                )}
              </div>
            </div>
          </FormContainer>
        )}

        {stage === "form" && appMode === "multi" && role === "server" && (
          <FormContainer>
            <h3 className="section-title small">Server Configuration</h3>
            <Field label="PostgreSQL Admin (postgres)" hint="Used once to initialize the system.">
              <input
                className="form-control"
                value={serverForm.pg_admin_user}
                onChange={(e) => setServerForm((f) => ({ ...f, pg_admin_user: e.target.value }))}
                placeholder="postgres"
              />
            </Field>
            <Field label="Admin Password">
              <input
                className="form-control"
                type="password"
                value={serverForm.pg_admin_password}
                onChange={(e) => setServerForm((f) => ({ ...f, pg_admin_password: e.target.value }))}
                placeholder="password"
              />
            </Field>
            <Field label="Server IP Address" hint="Other PCs will use this IP to connect.">
              <input
                className="form-control"
                value={serverForm.server_ip}
                onChange={(e) => setServerForm((f) => ({ ...f, server_ip: e.target.value }))}
                placeholder="e.g. 192.168.1.10"
              />
            </Field>
            <Field label="Database Name" hint="Choose any name. If it's new, it will be automatically created.">
              <input
                className="form-control"
                value={serverForm.db_name}
                onChange={(e) => setServerForm((f) => ({ ...f, db_name: e.target.value }))}
                placeholder="production_db"
              />
            </Field>
            <div className="form-actions" style={{ marginTop: 24 }}>
              <SecondaryButton onClick={() => runDocker("server")} disabled={dockerBusy}>
                {dockerBusy ? "Building..." : "Build & Start (Docker)"}
              </SecondaryButton>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <PrimaryButton onClick={() => submit({ mode: "server", ...serverForm })} disabled={busy || !dockerDone}>
                  {busy ? "Initializing Database..." : "Start Server"}
                </PrimaryButton>
                {!dockerDone && (
                  <span style={{ fontSize: 11, color: '#f59e0b' }}>
                    ⚠ Run "Build & Start (Docker)" first
                  </span>
                )}
              </div>
            </div>
          </FormContainer>
        )}

        {stage === "form" && appMode === "multi" && role === "client" && (
          <FormContainer>
            <h3 className="section-title small">Client Configuration</h3>
            <Field label="Server IP Address">
              <input
                className="form-control"
                value={clientForm.server_ip}
                onChange={(e) => setClientForm((f) => ({ ...f, server_ip: e.target.value }))}
                placeholder="e.g. 192.168.1.10"
              />
            </Field>
            <div className="form-actions" style={{ marginTop: 24 }}>
              <SecondaryButton onClick={discover} disabled={busy} style={{ marginRight: 12 }}>
                Scan Network
              </SecondaryButton>
              <PrimaryButton
                onClick={() => submit({ mode: "client", ...clientForm })}
                disabled={busy || !clientForm.server_ip}
              >
                {busy ? "Saving..." : "Connect to Server"}
              </PrimaryButton>
            </div>
          </FormContainer>
        )}

        <div className="setup-footer" style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 }}>
          {canBack && (
            <button
              className="btn-text"
              onClick={back}
              disabled={busy}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}
            >
              Back to mode selection
            </button>
          )}
        </div>

        {dockerOutput ? (
          <div style={{ marginTop: 20 }}>
            <div className="text-secondary" style={{ fontSize: 12, marginBottom: 6 }}>Docker Output</div>
            {dockerStatus ? (
              <div className="text-secondary" style={{ fontSize: 12, marginBottom: 6 }}>
                Status: {dockerStatus}
              </div>
            ) : null}
            <pre
              ref={terminalRef}
              style={{
                background: "#0f172a",
                color: "#e2e8f0",
                padding: 12,
                borderRadius: 8,
                height: 260,
                overflowY: "scroll",
                whiteSpace: "pre-wrap",
                fontSize: 12,
                wordBreak: "break-all",
              }}
            >
              {dockerOutput}
            </pre>
          </div>
        ) : null}
      </div>

      <style>{`
        .setup-wizard-overlay {
          position: fixed;
          inset: 0;
          background: #f8fafc;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
          overflow-y: auto;
        }
        .setup-wizard-card {
          width: 100%;
          max-width: 640px;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          padding: 40px;
          margin: auto;
        }
        .setup-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 24px;
        }
        .setup-choice {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          padding: 24px;
          background: #fff;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .setup-choice:hover {
          border-color: var(--primary-500);
          background: #f1f5f9;
        }
        .setup-choice.active {
          border-color: var(--primary-600);
          background: #eff6ff;
        }
        .choice-title {
          font-weight: 700;
          font-size: 16px;
          margin-bottom: 8px;
          color: #1e293b;
        }
        .choice-desc {
          font-size: 13px;
          color: #64748b;
          line-height: 1.5;
        }
        .btn-text:hover {
          color: var(--primary-600) !important;
        }
      `}</style>
    </div>
  );
}
