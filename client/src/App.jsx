import { Routes, Route } from "react-router-dom";
import { DBProvider, useDB } from "./context/DBContext";
import Header   from "./components/layout/Header";
import Sidebar  from "./components/layout/Sidebar";
import Toast    from "./components/ui/Toast";

import Dashboard     from "./pages/Dashboard";
import Students      from "./pages/Students";
import WeeklyEntry   from "./pages/WeeklyEntry";
import TrackingSheet from "./pages/TrackingSheet";
import Analytics     from "./pages/Analytics";
import Interventions from "./pages/Interventions";
import Contest       from "./pages/Contest";
import Framework          from "./pages/Framework";
import PlacementReadiness from "./pages/PlacementReadiness";

function AppShell() {
  const { loading, error } = useDB();

  if (loading) {
    return (
      <div style={{ position:"fixed",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",gap:16,background:"rgba(15,23,42,.9)",
        color:"#fff",zIndex:9999 }}>
        <div style={{ width:44,height:44,border:"4px solid rgba(255,255,255,.2)",
          borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite" }} />
        <div style={{ fontSize:15,fontWeight:600 }}>Connecting to MongoDB Atlas…</div>
        <div style={{ fontSize:12,opacity:.6 }}>Loading your data</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ position:"fixed",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",gap:12,background:"#fff" }}>
        <div style={{ fontSize:40 }}>❌</div>
        <div style={{ fontSize:16,fontWeight:700 }}>Failed to connect to MongoDB</div>
        <div style={{ fontSize:13,color:"#666",maxWidth:400,textAlign:"center" }}>{error}</div>
        <div style={{ fontSize:13,color:"#666" }}>Make sure the API server is running on port 5001.</div>
        <button onClick={()=>window.location.reload()}
          style={{ marginTop:8,padding:"8px 24px",background:"#6366F1",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <Header />
      <Sidebar />
      <div className="app-body">
        <main className="main-content">
          <Routes>
            <Route path="/"              element={<Dashboard />}    />
            <Route path="/students"      element={<Students />}     />
            <Route path="/entry"         element={<WeeklyEntry />}  />
            <Route path="/tracking"      element={<TrackingSheet />}/>
            <Route path="/analytics"     element={<Analytics />}    />
            <Route path="/interventions" element={<Interventions />}/>
            <Route path="/contest"       element={<Contest />}      />
            <Route path="/placement"     element={<PlacementReadiness />} />
            <Route path="/framework"     element={<Framework />}    />
          </Routes>
        </main>
      </div>
      <Toast />
    </>
  );
}

export default function App() {
  return (
    <DBProvider>
      <AppShell />
    </DBProvider>
  );
}
