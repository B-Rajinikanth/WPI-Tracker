import { useState, useRef, useEffect } from "react";
import { useDB } from "../../context/DBContext";
import { useAuth } from "../../context/AuthContext";
import { weekLabel } from "../../utils/wpi";
import ChangePasswordModal from "../ui/ChangePasswordModal";

export default function Header() {
  const { weeks, activeWeek, addWeek, setActiveWeek } = useDB();
  const { user, logout } = useAuth();
  const [showDialog, setShowDialog]     = useState(false);
  const [weekTitle, setWeekTitle]       = useState("");
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [menuOpen, setMenuOpen]         = useState(false);
  const menuRef = useRef(null);

  const isAdmin = user?.role === "admin";

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openDialog = () => {
    setWeekTitle(`Week ${weeks.length + 1}`);
    setShowDialog(true);
  };

  const confirmAddWeek = async () => {
    const label = weekTitle.trim();
    if (!label) return;
    await addWeek(label);
    setShowDialog(false);
  };

  // User initials for avatar
  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <>
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-uni">Sreenidhi University</div>
          <div className="app-logo-title">WPI Tracker — A24 Batch</div>
          <div className="app-logo-sub">Skill Development Centre</div>
        </div>

        {user?.role !== "student" && (
          <div className="header-controls">
            <span className="header-week-label">Active Week:</span>
            <select
              className="week-select"
              value={activeWeek}
              onChange={e => setActiveWeek(e.target.value)}
            >
              {weeks.map(w => (
                <option key={w} value={w}>{weekLabel(w)}</option>
              ))}
            </select>
            {isAdmin && (
              <button className="btn-header" onClick={openDialog}>+ New Week</button>
            )}
          </div>
        )}

        {/* User menu — hamburger dropdown */}
        <div className="header-user-section" ref={menuRef}>
          <button
            className="header-menu-btn"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="User menu"
          >
            <span className="header-avatar">{initials}</span>
            <span className="header-user-name-block">
              <span className="header-user-name">{user?.name}</span>
              <span className="header-user-role">{user?.role}</span>
            </span>
            <svg className="header-chevron" viewBox="0 0 10 6" width="10" height="6" fill="currentColor">
              <path d="M0 0l5 6 5-6z"/>
            </svg>
          </button>

          {menuOpen && (
            <div className="header-dropdown">
              <div className="header-dropdown-user">
                <div className="header-dropdown-avatar">{initials}</div>
                <div>
                  <div className="header-dropdown-name">{user?.name}</div>
                  <div className="header-dropdown-role">{user?.role}</div>
                </div>
              </div>
              <div className="header-dropdown-divider" />
              <button
                className="header-dropdown-item"
                onClick={() => { setMenuOpen(false); setShowChangePwd(true); }}
              >
                <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor" style={{flexShrink:0}}>
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                </svg>
                Change Password
              </button>
              <button
                className="header-dropdown-item header-dropdown-signout"
                onClick={() => { setMenuOpen(false); logout(); }}
              >
                <svg viewBox="0 0 20 20" width="15" height="15" fill="currentColor" style={{flexShrink:0}}>
                  <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1v-2a1 1 0 10-2 0v1H4V5h6v1a1 1 0 102 0V4a1 1 0 00-1-1H3z" clipRule="evenodd"/>
                  <path d="M13.293 7.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 12H8a1 1 0 110-2h6.586l-1.293-1.293a1 1 0 010-1.414z"/>
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}

      {showDialog && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:9000
        }}>
          <div style={{
            background:"#fff",borderRadius:14,padding:28,width:"min(380px,92vw)",
            boxShadow:"0 8px 32px rgba(0,0,0,.2)",
            borderTop:"4px solid var(--blue-mid)"
          }}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4,color:"var(--text)"}}>Create New Week</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:16}}>Enter a title for the new performance week.</div>
            <label style={{fontSize:11,fontWeight:700,display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:".5px",color:"var(--text-muted)"}}>Week Title</label>
            <input
              autoFocus
              className="form-control"
              value={weekTitle}
              onChange={e => setWeekTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmAddWeek(); if (e.key === "Escape") setShowDialog(false); }}
              placeholder="e.g. Week 5 – Python Sprint"
              style={{marginBottom:20}}
            />
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={() => setShowDialog(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmAddWeek} disabled={!weekTitle.trim()}>
                Create Week
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
