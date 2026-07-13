import { useState } from "react";
import axios from "axios";
import { useAuth } from "../../context/AuthContext";

export default function ChangePasswordModal({ onClose }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirm: "" });
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirm) { setError("New passwords do not match"); return; }
    if (form.newPassword.length < 6)       { setError("New password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await axios.put("/api/auth/me/password", {
        userId: user.id,
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Change Password</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
          Signed in as <strong>{user?.name}</strong>
        </div>

        {success ? (
          <>
            <div style={{
              background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 8,
              padding: "14px 16px", fontSize: 14, color: "#1B5E20", marginBottom: 20,
            }}>
              ✓ Password changed successfully!
            </div>
            <button className="btn btn-primary" onClick={onClose} style={{ width: "100%", justifyContent: "center" }}>
              Done
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: "#FFF3F3", border: "1px solid #FFCDD2", borderRadius: 8,
                padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#B71C1C",
              }}>
                {error}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input className="form-control" type="password" autoFocus required
                value={form.oldPassword} onChange={e => setForm(p => ({ ...p, oldPassword: e.target.value }))}
                placeholder="Enter current password" />
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">New Password</label>
              <input className="form-control" type="password" required
                value={form.newPassword} onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))}
                placeholder="Min. 6 characters" />
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Confirm New Password</label>
              <input className="form-control" type="password" required
                value={form.confirm} onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Repeat new password" />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Change Password"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
