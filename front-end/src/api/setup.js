import axios from 'axios';

const API = '';

export const getConfig = async () => {
    try {
        const res = await axios.get(`${API}/api/config`);
        return res.data;
    } catch (err) {
        return { configured: false, error: err.message };
    }
};

export const getHealth = async () => {
    try {
        const res = await axios.get(`${API}/api/health`);
        return res.data;
    } catch (err) {
        return { status: 'error', error: err.message };
    }
};

export const performSetup = async (data) => {
    const res = await axios.post(`${API}/api/setup`, data);
    return res.data;
};

export const discoverServers = async () => {
    const res = await axios.get(`${API}/api/discover`);
    return res.data;
};

export const getAllowedClients = async () => {
    const res = await axios.get(`${API}/api/allowed-clients`);
    return res.data;
};

export const addAllowedClient = async (clientName, ipAddress) => {
    const res = await axios.post(`${API}/api/allowed-clients`, {
        client_name: clientName,
        ip_address: ipAddress,
    });
    return res.data;
};

export const resetConfig = async () => {
    const res = await axios.post(`${API}/api/setup/reset`);
    return res.data;
};

export const deleteAllowedClient = async (clientId) => {
    const res = await axios.delete(`${API}/api/allowed-clients/${clientId}`);
    return res.data;
};
