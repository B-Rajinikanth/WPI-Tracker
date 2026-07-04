import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/",              icon: "📊", label: "Dashboard"             },
  { to: "/students",      icon: "👥", label: "Students"              },
  { to: "/entry",         icon: "✏️",  label: "Weekly Entry"         },
  { to: "/tracking",      icon: "📋", label: "Tracking Sheet"        },
  { to: "/analytics",     icon: "📈", label: "Analytics"             },
  { to: "/interventions", icon: "🚨", label: "Interventions"         },
  { to: "/contest",       icon: "🏆", label: "Contest Participation" },
  { to: "/placement",      icon: "🎯", label: "Placement Readiness"  },
  { to: "/framework",     icon: "📄", label: "Framework"             },
];

export default function Sidebar() {
  return (
    <nav className="app-nav">
      {LINKS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          <span className="nav-icon">{icon}</span>
          <span className="nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
