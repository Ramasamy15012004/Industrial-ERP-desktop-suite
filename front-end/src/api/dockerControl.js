export async function runDockerProfile(profile) {
  console.log("[DockerControl] Starting fetch to http://127.0.0.1:8765/run");
  const res = await fetch("http://127.0.0.1:8765/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  console.log("[DockerControl] Response received:", res.status, res.statusText);
  const data = await res.json();
  console.log("[DockerControl] Data:", data);
  if (!res.ok || data?.ok === false) {
    const message = data?.error || "Docker control failed";
    const detail = [data?.stdout, data?.stderr].filter(Boolean).join("\n");
    const error = new Error(detail ? `${message}\n${detail}` : message);
    error.data = data;
    throw error;
  }
  return data;
}

export async function stopDockerProfile(profile) {
  const res = await fetch("http://127.0.0.1:8765/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  const data = await res.json();
  if (!res.ok || data?.ok === false) {
    const message = data?.error || "Docker stop failed";
    const detail = [data?.stdout, data?.stderr].filter(Boolean).join("\n");
    const error = new Error(detail ? `${message}\n${detail}` : message);
    error.data = data;
    throw error;
  }
  return data;
}

export async function getDockerJob(jobId) {
  const res = await fetch(`http://127.0.0.1:8765/status?job_id=${jobId}`);
  const data = await res.json();
  if (!res.ok || data?.ok === false) {
    const message = data?.error || "Docker status failed";
    const error = new Error(message);
    error.data = data;
    throw error;
  }
  return data;
}
