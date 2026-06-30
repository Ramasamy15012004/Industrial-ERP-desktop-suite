import React, { useEffect, useState } from "react";
import { getAllowedClients, addAllowedClient, deleteAllowedClient } from "../../api/setup";
import FormContainer from "../../components/ui/FormContainer";
import FormInput from "../../components/ui/FormInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import TableContainer from "../../components/ui/TableContainer";
import { HelpCircle, Plus, ShieldCheck, Trash2 } from "lucide-react";

export default function AllowedClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [newClient, setNewClient] = useState({ name: "", ip: "" });

  const loadClients = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await getAllowedClients();
      setClients(data.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load allowed clients. Are you in Server mode?");
    } finally {
      setLoading(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleAdd = async () => {
    setError("");
    if (!newClient.name || !newClient.ip) {
      return setError("Both name and IP address are required.");
    }
    
    try {
      await addAllowedClient(newClient.name, newClient.ip);
      setNewClient({ name: "", ip: "" });
      loadClients();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to add client.");
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove authorization for "${name}"?`)) return;
    try {
      await deleteAllowedClient(id);
      loadClients();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to delete client.");
    }
  };

  return (
    <div className="module-page">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Authorized Network Clients</h3>
          <ShieldCheck size={20} color="var(--primary-600)" />
        </div>
        <p className="text-secondary" style={{ marginTop: 6 }}>
          Manage which devices are permitted to connect to this server over the network.
        </p>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ marginBottom: 24 }}>
        <h4 className="section-title small">Authorize New Device</h4>
        <FormContainer>
          <div className="form-grid">
            <FormInput
              label="Device/User Name"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              placeholder="e.g. Workshop PC 1"
            />
            <FormInput
              label="IP Address"
              value={newClient.ip}
              onChange={(e) => setNewClient({ ...newClient, ip: e.target.value })}
              placeholder="e.g. 192.168.1.15"
            />
          </div>
          <div className="form-actions">
            <PrimaryButton onClick={handleAdd}>
              <Plus size={16} style={{ marginRight: 8 }} />
              Authorize Device
            </PrimaryButton>
          </div>
        </FormContainer>
      </div>

      <div>
        <h4 className="section-title small">Authorized Devices</h4>
        <TableContainer>
          <table>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>IP Address</th>
                <th>Authorized On</th>
                <th style={{ width: 80, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="table-empty">Loading authorization list...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan="4" className="table-empty">No external devices authorized yet.</td></tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.client_name}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--primary-700)' }}>{c.ip_address}</td>
                    <td className="text-secondary">
                      {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => handleDelete(c.id, c.client_name)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        title="Remove Authorization"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableContainer>
      </div>
    </div>
  );
}
