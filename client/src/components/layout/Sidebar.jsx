import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ALL_LINKS = [
  { to: "/",              icon: "📊", label: "Dashboard",            roles: ["admin","faculty"] },
  { to: "/students",      icon: "👥", label: "Students",             roles: ["admin"] },
  { to: "/entry",         icon: "✏️",  label: "Weekly Entry",        roles: ["admin"] },
  { to: "/tracking",      icon: "📋", label: "Tracking Sheet",       roles: ["admin","faculty"] },
  { to: "/analytics",     icon: "📈", label: "Analytics",            roles: ["admin","faculty"] },
  { to: "/interventions", icon: "🚨", label: "Interventions",        roles: ["admin","faculty"] },
  { to: "/contest",       icon: "🏆", label: "Contest Participation",roles: ["admin","faculty"] },
  { to: "/placement",     icon: "🎯", label: "Placement Readiness",  roles: ["admin","faculty"] },
  { to: "/framework",     icon: "📄", label: "Framework",            roles: ["admin","faculty"] },
  { to: "/users",         icon: "🔑", label: "User Management",      roles: ["admin"] },
  { to: "/student",       icon: "🎓", label: "My Dashboard",         roles: ["student"] },
  { to: "/framework",    icon: "📄", label: "Framework",            roles: ["student"] },
];

export default function Sidebar() {
  const { user } = useAuth();
  const role = user?.role || "student";
  const links = ALL_LINKS.filter(l => l.roles.includes(role));

  return (
    <nav className="app-nav">
      {links.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/" || to === "/student"}
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <span className="nav-icon">{icon}</span>
          <span className="nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
