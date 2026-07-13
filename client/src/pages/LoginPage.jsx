import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try { await login(username.trim(), password); }
    catch { /* error shown via context */ }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-secondary)", padding: 16,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo / title */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, background: "var(--blue)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 12,
            fontSize: 24, margin: "0 auto 16px", color: "white", fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>SUH</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>WPI Tracker</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Weekly Performance Intelligence</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: "var(--text)" }}>Sign in to your account</div>

          {error && (
            <div style={{
              background: "#FFF3F3", border: "1px solid #FFCDD2", borderRadius: 8,
              padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#B71C1C",
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username / URN</label>
              <input
                className="form-control"
                type="text"
                placeholder="Enter username or URN"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label">Password</label>
              <input
                className="form-control"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: 20, justifyContent: "center" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
          Students: use your URN as username · Contact admin for access
        </div>
      </div>
    </div>
  );
}
