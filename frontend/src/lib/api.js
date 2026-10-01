import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("cb_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export const fileUrl = (path) =>
  `${API}/files?path=${encodeURIComponent(path)}&auth=${encodeURIComponent(
    localStorage.getItem("cb_token") || ""
  )}`;

export function apiError(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Something went wrong.";
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d.map((x) => (x && typeof x.msg === "string" ? x.msg : JSON.stringify(x))).join(" ");
  if (d && typeof d.msg === "string") return d.msg;
  return String(d);
}
