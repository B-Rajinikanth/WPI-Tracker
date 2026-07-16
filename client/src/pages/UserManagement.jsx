import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import axios from "axios";
import { useDB } from "../context/DBContext";

export default function UserManagement() {
  const { students } = useDB();

  const [users, setUsers]           = useState([]);
  const [search, setSearch]         = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  // Create form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm]     = useState({ name: "", username: "", password: "", role: "faculty", studentId: "" });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // Reset password
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd]           = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  // Role change
  const [roleTarget, setRoleTarget] = useState(null);   // user object
  const [newRole, setNewRole]       = useState("");
  const [newStudentId, setNewStudentId] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);

  // Bulk create student users
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult]   = useState(null);

  // Bulk upload faculty
  const [facultyBulkLoading, setFacultyBulkLoading] = useState(false);
  const [facultyBulkResult, setFacultyBulkResult]   = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/auth/users");
      setUsers(data);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async e => {
    e.preventDefault();
    setFormErr("");
    if (!form.name || !form.username || !form.password) { setFormErr("Name, username and password are required"); return; }
    if (form.role === "student" && !form.studentId) { setFormErr("Select the linked student for student role"); return; }
    setSaving(true);
    try {
      await axios.post("/api/auth/users", { ...form, studentId: form.role === "student" ? form.studentId : null });
      setForm({ name: "", username: "", password: "", role: "faculty", studentId: "" });
      setShowCreateModal(false);
      await loadUsers();
    } catch (e) {
      setFormErr(e.response?.data?.error || "Failed to create user");
    } finally { setSaving(false); }
  };

  const handleToggleActive = async u => {
    try {
      const { data } = await axios.put(`/api/auth/users/${u._id}/toggle-active`);
      setUsers(prev => prev.map(x => x._id === u._id ? { ...x, isActive: data.isActive } : x));
    } catch (e) {
      alert(e.response?.data?.error || "Failed to update status");
    }
  };

  const handleDelete = async u => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await axios.delete(`/api/auth/users/${u._id}`);
    setUsers(prev => prev.filter(x => x._id !== u._id));
  };

  const handleBulkStudents = async () => {
    if (!confirm(`Create login accounts for all ${students.length} students?\nUsername = URN (lowercase), Password = Student@123\nExisting accounts will be skipped.`)) return;
    setBulkLoading(true); setBulkResult(null);
    try {
      const { data } = await axios.post("/api/auth/users/bulk-students");
      setBulkResult(data);
      await loadUsers();
    } catch (e) {
      alert(e.response?.data?.error || "Bulk create failed");
    } finally { setBulkLoading(false); }
  };

  const handleResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) { alert("Password must be at least 6 characters"); return; }
    setResetSaving(true);
    try {
      await axios.put(`/api/auth/users/${resetTarget._id}/password`, { password: newPwd });
      setResetTarget(null); setNewPwd("");
      await loadUsers();
      alert("Password reset successfully");
    } catch (e) {
      alert(e.response?.data?.error || "Reset failed");
    } finally { setResetSaving(false); }
  };

  // ── Role change ───────────────────────────────────────────
  const openRoleModal = u => {
    setRoleTarget(u);
    setNewRole(u.role);
    setNewStudentId(u.studentId || "");
  };

  const handleRoleChange = async () => {
    if (newRole === roleTarget.role && (newRole !== "student" || newStudentId === roleTarget.studentId)) {
      setRoleTarget(null); return;
    }
    if (newRole === "student" && !newStudentId) { alert("Select the linked student."); return; }
    setRoleSaving(true);
    try {
      const { data } = await axios.put(`/api/auth/users/${roleTarget._id}/role`, {
        role: newRole,
        studentId: newRole === "student" ? newStudentId : null,
      });
      setUsers(prev => prev.map(x =>
        x._id === roleTarget._id ? { ...x, role: data.role, studentId: data.studentId } : x
      ));
      setRoleTarget(null);
    } catch (e) {
      alert(e.response?.data?.error || "Role change failed");
    } finally { setRoleSaving(false); }
  };

  // ── Faculty bulk upload ───────────────────────────────────
  const downloadFacultyTemplate = () => {
    const headers = ["Name", "Username", "Password"];
    const example = [
      ["Dr. Priya Sharma",  "priya.sharma",  "Faculty@123"],
      ["Prof. Ravi Kumar",  "ravi.kumar",    "Faculty@123"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    const wsNotes = XLSX.utils.aoa_to_sheet([
      ["NOTE: Name and Username are required. Password is optional — defaults to Faculty@123 if left blank."],
      ["Usernames must be unique and will be stored in lowercase."],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faculty");
    XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");
    const buf  = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "Faculty_Upload_Template.xlsx";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleFacultyBulkUpload = async e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    setFacultyBulkLoading(true); setFacultyBulkResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const [hdr, ...rows] = raw;

      const ci = {};
      hdr.forEach((h, i) => {
        const n = String(h).toLowerCase().trim();
        if (n === "name")           ci.name     = i;
        else if (n === "username")  ci.username = i;
        else if (n === "password")  ci.password = i;
      });

      if (ci.name === undefined || ci.username === undefined) {
        alert("Excel must have 'Name' and 'Username' columns.");
        return;
      }

      const list = rows
        .filter(r => r[ci.name] || r[ci.username])
        .map(r => ({
          name:     String(r[ci.name]     || "").trim(),
          username: String(r[ci.username] || "").trim(),
          password: ci.password !== undefined ? String(r[ci.password] || "").trim() : "",
        }))
        .filter(r => r.name && r.username);

      if (!list.length) { alert("No valid rows found in the file."); return; }

      const { data } = await axios.post("/api/auth/users/bulk-faculty", { users: list });
      setFacultyBulkResult(data);
      await loadUsers();
    } catch (err) {
      alert("Upload failed: " + (err.response?.data?.error || err.message));
    } finally { setFacultyBulkLoading(false); }
  };

  // ── Helpers ───────────────────────────────────────────────
  const roleBadge = role => {
    const map = { admin: ["#E3F2FD","#0D47A1"], faculty: ["#E8F5E9","#1B5E20"], student: ["#FFF8E1","#F57F17"] };
    const [bg, color] = map[role] || ["#F5F5F5","#424242"];
    return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: bg, color }}>{role}</span>;
  };

  const studentName = id => students.find(s => s.id === id)?.name || id || "—";

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q || (
      u.name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.displayPassword?.toLowerCase().includes(q) ||
      studentName(u.studentId)?.toLowerCase().includes(q)
    );
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = { all: users.length, admin: 0, faculty: 0, student: 0 };
  users.forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });

  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-subtitle">Create and manage login accounts</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm page-action-btn"
            onClick={() => { setForm({ name: "", username: "", password: "", role: "faculty", studentId: "" }); setFormErr(""); setShowCreateModal(true); }}>
            + Create User
          </button>
          <button className="btn btn-outline btn-sm page-action-btn" onClick={handleBulkStudents} disabled={bulkLoading}>
            {bulkLoading ? "⏳ Creating…" : "👥 Bulk Create Students"}
          </button>

          {/* Faculty bulk upload */}
          <button className="btn btn-ghost btn-sm page-action-btn" onClick={downloadFacultyTemplate}>
            ⬇ Faculty Template
          </button>
          <label className={`btn btn-outline btn-sm page-action-btn${facultyBulkLoading ? " disabled" : ""}`}
            style={{ cursor: facultyBulkLoading ? "not-allowed" : "pointer" }}>
            {facultyBulkLoading ? "⏳ Uploading…" : "📥 Bulk Upload Faculty"}
            <input type="file" accept=".xlsx,.xls" onChange={handleFacultyBulkUpload}
              style={{ display: "none" }} disabled={facultyBulkLoading} />
          </label>
        </div>
      </div>

      {/* Student bulk result */}
      {bulkResult && (
        <div style={{
          background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 10,
          padding: "14px 18px", marginBottom: 16, fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "#1B5E20" }}>
            ✓ <strong>{bulkResult.created}</strong> student accounts created &nbsp;·&nbsp;
            <strong>{bulkResult.skipped}</strong> already existed and were skipped.
            {bulkResult.errors?.length > 0 && <span style={{ color: "#BF360C" }}> · {bulkResult.errors.length} errors</span>}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setBulkResult(null)}>✕</button>
        </div>
      )}

      {/* Faculty bulk result */}
      {facultyBulkResult && (
        <div style={{
          background: "#E3F2FD", border: "1px solid #90CAF9", borderRadius: 10,
          padding: "14px 18px", marginBottom: 16, fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "#0D47A1" }}>
            ✓ <strong>{facultyBulkResult.created}</strong> faculty accounts created &nbsp;·&nbsp;
            <strong>{facultyBulkResult.skipped}</strong> already existed and were skipped.
            {facultyBulkResult.errors?.length > 0 && (
              <span style={{ color: "#BF360C" }}> · {facultyBulkResult.errors.length} errors: {facultyBulkResult.errors.join(", ")}</span>
            )}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setFacultyBulkResult(null)}>✕</button>
        </div>
      )}

      {/* Users list */}
      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
            All Users ({filteredUsers.length}{filteredUsers.length !== users.length ? ` of ${users.length}` : ""})
          </div>
          <div className="search-wrap" style={{ width: "100%" }}>
            <input className="search-input" placeholder="Search name, username…"
              value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        {/* Role filter pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "all",     label: "All" },
            { key: "admin",   label: "Admin" },
            { key: "faculty", label: "Faculty" },
            { key: "student", label: "Student" },
          ].map(({ key, label }) => {
            const active = roleFilter === key;
            const colors = {
              all:     active ? ["#4B5563","#fff"] : ["#F3F4F6","#6B7280"],
              admin:   active ? ["#1E40AF","#fff"] : ["#EFF6FF","#1E40AF"],
              faculty: active ? ["#166534","#fff"] : ["#F0FDF4","#166534"],
              student: active ? ["#92400E","#fff"] : ["#FFFBEB","#92400E"],
            };
            const [bg, color] = colors[key];
            return (
              <button key={key} onClick={() => setRoleFilter(key)} style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 600, borderRadius: 20,
                border: "none", cursor: "pointer", background: bg, color, transition: "all 0.15s",
              }}>
                {label} <span style={{ opacity: 0.75 }}>({roleCounts[key]})</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ color: "#B71C1C", fontSize: 13 }}>{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No users match your search.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filteredUsers.map((u, i) => (
              <div key={u._id} style={{
                border: `1px solid ${u.isActive === false ? "#FFCDD2" : "var(--border)"}`,
                borderRadius: 10,
                background: u.isActive === false ? "#FFFAFA" : "var(--bg)",
                padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 10,
                opacity: u.isActive === false ? 0.75 : 1,
              }}>
                {/* Header: name + role badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{u.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>#{i + 1}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        background: u.isActive === false ? "#FFCDD2" : "#E8F5E9",
                        color: u.isActive === false ? "#B71C1C" : "#1B5E20",
                      }}>
                        {u.isActive === false ? "Inactive" : "Active"}
                      </span>
                    </div>
                  </div>
                  {roleBadge(u.role)}
                </div>

                {/* Credentials */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", width: 72, flexShrink: 0 }}>Username</span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text)", wordBreak: "break-all" }}>{u.username}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", width: 72, flexShrink: 0 }}>Password</span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text)" }}>
                      {u.displayPassword || <span style={{ color: "var(--text-muted)", fontFamily: "sans-serif", fontStyle: "italic" }}>not set</span>}
                    </span>
                  </div>
                  {u.role === "student" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", width: 72, flexShrink: 0 }}>Student</span>
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{studentName(u.studentId)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, paddingTop: 6, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => { setResetTarget(u); setNewPwd(""); }}>
                    🔑 Reset
                  </button>
                  {u.role !== "admin" && (
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center", color: "#4338CA" }}
                      onClick={() => openRoleModal(u)}>
                      ✎ Role
                    </button>
                  )}
                  {u.role !== "admin" && (
                    <button className="btn btn-ghost btn-sm"
                      style={{ flex: 1, justifyContent: "center", color: u.isActive === false ? "#1B5E20" : "#B45309" }}
                      onClick={() => handleToggleActive(u)}>
                      {u.isActive === false ? "✓ Activate" : "⊘ Deactivate"}
                    </button>
                  )}
                  {u.role !== "admin" && (
                    <button className="btn btn-ghost btn-sm" style={{ color: "#B71C1C" }}
                      onClick={() => handleDelete(u)}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create User modal ─────────────────────────────── */}
      {showCreateModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="card" style={{ width: "100%", maxWidth: 480, padding: 28, margin: "0 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Create New User</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Add an admin, faculty, or student login account</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(false)} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            {formErr && (
              <div style={{ background: "#FFF3F3", border: "1px solid #FFCDD2", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#B71C1C" }}>
                {formErr}
              </div>
            )}
            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Full Name</label>
                <input className="form-control" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Dr. Priya Sharma" autoFocus required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input className="form-control" value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="priya.sharma" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-control" type="password" value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min. 6 characters" required />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Role</label>
                <select className="form-control" value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value, studentId: "" }))}>
                  <option value="admin">Admin</option>
                  <option value="faculty">Faculty</option>
                  <option value="student">Student</option>
                </select>
              </div>
              {form.role === "student" && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Linked Student</label>
                  <select className="form-control" value={form.studentId}
                    onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))}>
                    <option value="">— Select student —</option>
                    {sortedStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.urn})</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="btn btn-primary" type="submit" disabled={saving} style={{ flex: 1 }}>
                  {saving ? "Creating…" : "+ Create User"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowCreateModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset password modal ──────────────────────────── */}
      {resetTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }}>
          <div className="card" style={{ width: "100%", maxWidth: 380, padding: 28, margin: "0 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Reset Password</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
              for <strong>{resetTarget.name}</strong> ({resetTarget.username})
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-control" type="password" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} placeholder="Min. 6 characters" autoFocus />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleResetPwd} disabled={resetSaving}>
                {resetSaving ? "Saving…" : "Reset"}
              </button>
              <button className="btn btn-ghost" onClick={() => setResetTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Role modal ─────────────────────────────── */}
      {roleTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={e => { if (e.target === e.currentTarget) setRoleTarget(null); }}>
          <div className="card" style={{ width: "100%", maxWidth: 400, padding: 28, margin: "0 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Change Role</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {roleTarget.name} &nbsp;·&nbsp; <span style={{ fontFamily: "monospace" }}>{roleTarget.username}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRoleTarget(null)} style={{ fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{
              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8,
              padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#92400E",
            }}>
              ⚠ Current role: <strong>{roleTarget.role}</strong>. Changing role may affect what this user can access.
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">New Role</label>
              <select className="form-control" value={newRole}
                onChange={e => { setNewRole(e.target.value); setNewStudentId(""); }}>
                <option value="faculty">Faculty</option>
                <option value="student">Student</option>
              </select>
            </div>

            {newRole === "student" && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Linked Student</label>
                <select className="form-control" value={newStudentId}
                  onChange={e => setNewStudentId(e.target.value)}>
                  <option value="">— Select student —</option>
                  {sortedStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.urn})</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" onClick={handleRoleChange} disabled={roleSaving} style={{ flex: 1 }}>
                {roleSaving ? "Saving…" : "Save Role"}
              </button>
              <button className="btn btn-ghost" onClick={() => setRoleTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
