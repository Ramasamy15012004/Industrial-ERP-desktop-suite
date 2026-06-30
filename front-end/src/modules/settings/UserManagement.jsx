// UserManagement.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import FormContainer from "../../components/ui/FormContainer";
import FormInput from "../../components/ui/FormInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";
import TableContainer from "../../components/ui/TableContainer";
import { HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = "http://localhost:8000";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "production", label: "Production Manager / Supervisor" },
  { value: "inventory", label: "Inventory / Store Manager" },
  { value: "audit", label: "Audit / View-only" },
];

function emptyCreateForm() {
  return { username: "", full_name: "", role: "production", password: "" };
}

function formatError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || "An unexpected error occurred";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  }
  return JSON.stringify(detail);
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [createForm, setCreateForm] = useState(emptyCreateForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const roleLabelByValue = useMemo(() => {
    const m = new Map();
    ROLE_OPTIONS.forEach((r) => m.set(r.value, r.label));
    return m;
  }, []);

  const loadUsers = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`${API}/users`);
      const list = Array.isArray(res.data) ? res.data : [];
      setUsers(list);
      setDrafts(
        Object.fromEntries(
          list.map((u) => [
            u.id,
            {
              full_name: u.full_name || "",
              role: u.role || "production",
              is_active: Boolean(u.is_active),
            },
          ])
        )
      );
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async () => {
    setError("");
    if (!createForm.username.trim()) return setError("Username is required");
    if (!createForm.password) return setError("Password is required");

    try {
      await axios.post(`${API}/users`, {
        username: createForm.username,
        full_name: createForm.full_name || "",
        role: createForm.role,
        password: createForm.password,
      });
      setCreateForm(emptyCreateForm());
      await loadUsers();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const handleSave = async (userId) => {
    setError("");
    const draft = drafts[userId];
    if (!draft) return;

    try {
      await axios.put(`${API}/users/${userId}`, {
        full_name: draft.full_name,
        role: draft.role,
        is_active: Boolean(draft.is_active),
      });
      await loadUsers();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const handleResetPassword = async (userId, username) => {
    setError("");
    const next = window.prompt(`Enter new password for ${username}:`);
    if (!next) return;

    try {
      await axios.put(`${API}/users/${userId}/password`, { password: next });
      await loadUsers();
    } catch (err) {
      setError(formatError(err));
    }
  };

  const handleHelpClick = () => {
    navigate("/help#settings-user-management");
  };

  const styles = {
    header: {
      marginBottom: '20px',
    },
    titleContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    title: {
      margin: 0,
    },
    helpIconButton: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      padding: '0',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '50%',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      color: '#6c757d',
    },
  };

  return (
    <div className="module-page scroll-auto">
      <div style={styles.header}>
        <div style={styles.titleContainer}>
          <h3 className="section-title" style={styles.title}>User Management</h3>
          <button
            onClick={handleHelpClick}
            style={styles.helpIconButton}
            className="help-icon-btn"
            title="User Management – Create and manage user accounts. Assign roles (Admin, Production, Inventory, Audit) to control access to different modules. Reset passwords and activate/deactivate users."
          >
            <HelpCircle size={18} />
          </button>
        </div>
        <p className="text-secondary" style={{ marginTop: 6 }}>
          Create users and assign roles: Admin, Production, Inventory, Audit.
        </p>
      </div>

      {error ? (
        <div className="form-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <h4 className="section-title small">Create User</h4>
        <FormContainer>
          <div className="form-grid">
            <FormInput
              label="Username"
              value={createForm.username}
              onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="e.g. auditor1"
            />
            <FormInput
              label="Full Name"
              value={createForm.full_name}
              onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Optional"
            />
            <FormInput
              as="select"
              label="Role"
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </FormInput>
            <FormInput
              label="Password"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Set initial password"
            />
          </div>

          <div className="form-actions">
            <PrimaryButton type="button" onClick={handleCreate}>
              Create User
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setCreateForm(emptyCreateForm())}>
              Clear
            </SecondaryButton>
          </div>
        </FormContainer>
      </div>

      <div style={{ marginTop: 18 }}>
        <h4 className="section-title small">Users</h4>
        <TableContainer className="table-container-fill">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Active</th>
                <th style={{ width: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="table-empty">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="table-empty">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const d = drafts[u.id] || { full_name: "", role: u.role, is_active: u.is_active };
                  const dirty =
                    d.full_name !== (u.full_name || "") ||
                    d.role !== u.role ||
                    Boolean(d.is_active) !== Boolean(u.is_active);

                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 700 }}>{u.username}</td>
                      <td>
                        <input
                          className="form-control"
                          value={d.full_name}
                          onChange={(e) =>
                            setDrafts((all) => ({
                              ...all,
                              [u.id]: { ...d, full_name: e.target.value },
                            }))
                          }
                          placeholder="Full name"
                        />
                      </td>
                      <td>
                        <select
                          className="form-control"
                          value={d.role}
                          onChange={(e) =>
                            setDrafts((all) => ({
                              ...all,
                              [u.id]: { ...d, role: e.target.value },
                            }))
                          }
                          title={roleLabelByValue.get(d.role) || d.role}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(d.is_active)}
                          onChange={(e) =>
                            setDrafts((all) => ({
                              ...all,
                              [u.id]: { ...d, is_active: e.target.checked },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <PrimaryButton
                            type="button"
                            onClick={() => handleSave(u.id)}
                            disabled={!dirty}
                            className="btn-sm"
                            title={dirty ? "Save changes" : "No changes"}
                          >
                            Save
                          </PrimaryButton>
                          <SecondaryButton
                            type="button"
                            className="btn-sm"
                            onClick={() => handleResetPassword(u.id, u.username)}
                            title="Reset password (revokes sessions)"
                          >
                            Reset Password
                          </SecondaryButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableContainer>
      </div>
    </div>
  );
}
