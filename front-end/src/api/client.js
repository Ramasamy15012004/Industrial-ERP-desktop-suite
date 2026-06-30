let API_BASE = "http://localhost:8000";

export const getApiBase = () => API_BASE;

export const setApiBase = (url) => {
  if (!url) return;
  // Ensure protocol
  if (!url.startsWith("http")) {
    API_BASE = `http://${url}`;
  } else {
    API_BASE = url;
  }
  
  // Ensure port if missing (assuming 8000)
  if (!API_BASE.includes(":", 7)) {
    API_BASE = `${API_BASE}:8000`;
  }
  
  console.log("Global API Base set to:", API_BASE);
};
