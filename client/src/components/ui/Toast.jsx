import { useEffect, useRef, useState } from "react";
import { useDB } from "../../context/DBContext";

export default function Toast() {
  const { toastRef } = useDB();
  const [msg, setMsg]  = useState("");
  const [type, setType] = useState("info");
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    toastRef.current = (m, t = "info") => {
      setMsg(m); setType(t); setShow(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), 3200);
    };
  }, [toastRef]);

  return (
    <div id="toast" className={show ? `show ${type}` : ""}>
      {msg}
    </div>
  );
}
