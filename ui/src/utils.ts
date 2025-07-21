// Utility to get API base URL
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;
  return `http://${window.location.hostname}:5000`;
} 