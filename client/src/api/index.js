import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// ── Data ─────────────────────────────────────────────────
export const getData       = ()       => api.get("/data").then(r => r.data);

// ── Students ─────────────────────────────────────────────
export const getStudents   = ()       => api.get("/students").then(r => r.data);
export const createStudent = (s)      => api.post("/students", s).then(r => r.data);
export const updateStudent = (id, s)  => api.put(`/students/${id}`, s).then(r => r.data);
export const deleteStudent = (id)     => api.delete(`/students/${id}`).then(r => r.data);
export const bulkStudents  = (arr)    => api.post("/students/bulk", { students: arr }).then(r => r.data);

// ── Records ───────────────────────────────────────────────
export const getRecords    = (params) => api.get("/records", { params }).then(r => r.data);
export const saveRecord    = (rec)    => api.post("/records", rec).then(r => r.data);
export const deleteRecord  = (id)     => api.delete(`/records/${id}`).then(r => r.data);
export const deleteWeekRecords = (week) => api.delete(`/records/week/${encodeURIComponent(week)}`).then(r => r.data);
export const bulkRecords   = (arr)    => api.post("/records/bulk", { records: arr }).then(r => r.data);

// ── Settings ─────────────────────────────────────────────
export const getSettings   = ()       => api.get("/settings").then(r => r.data);
export const saveSettings  = (data)   => api.put("/settings", data).then(r => r.data);
