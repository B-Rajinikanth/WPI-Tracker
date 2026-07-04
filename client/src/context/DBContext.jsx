import { createContext, useContext, useEffect, useReducer, useCallback, useRef } from "react";
import * as api from "../api";
import { calcScores, isoWeek, uid, calcTrend } from "../utils/wpi";

// ── State ─────────────────────────────────────────────────
const init = { students: [], weeks: [], records: [], activeWeek: "", loading: true, error: null };

function reducer(state, action) {
  switch (action.type) {
    case "LOAD":   return { ...state, ...action.payload, loading: false };
    case "ERROR":  return { ...state, error: action.payload, loading: false };

    case "ADD_STUDENT":    return { ...state, students: [...state.students, action.payload] };
    case "UPD_STUDENT":    return { ...state, students: state.students.map(s => s.id === action.payload.id ? action.payload : s) };
    case "DEL_STUDENT":    return { ...state,
      students: state.students.filter(s => s.id !== action.payload),
      records:  state.records.filter(r => r.studentId !== action.payload),
    };
    case "BULK_STUDENTS":  return { ...state, students: action.payload };

    case "SAVE_RECORD": {
      const idx = state.records.findIndex(r => r.studentId === action.payload.studentId && r.week === action.payload.week);
      return { ...state, records: idx >= 0
        ? state.records.map((r, i) => i === idx ? action.payload : r)
        : [...state.records, action.payload]
      };
    }
    case "BULK_RECORDS": {
      const map = new Map(state.records.map(r => [`${r.studentId}|${r.week}`, r]));
      action.payload.forEach(r => map.set(`${r.studentId}|${r.week}`, r));
      return { ...state, records: [...map.values()] };
    }

    case "ADD_WEEK":       return { ...state,
      weeks: [...state.weeks, action.payload],
      activeWeek: action.payload,
    };
    case "SET_WEEK":       return { ...state, activeWeek: action.payload };

    default: return state;
  }
}

// ── Context ───────────────────────────────────────────────
const DBCtx = createContext(null);
export const useDB = () => useContext(DBCtx);

export function DBProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);
  const toastRef = useRef(null);   // set by Toast component

  // ── Boot: load from MongoDB ───────────────────────────
  useEffect(() => {
    api.getData()
      .then(data => dispatch({ type: "LOAD", payload: data }))
      .catch(err  => dispatch({ type: "ERROR", payload: err.message }));
  }, []);

  // ── Toast helper ──────────────────────────────────────
  const toast = useCallback((msg, type = "info") => {
    toastRef.current?.(msg, type);
  }, []);

  // ── Student actions ───────────────────────────────────
  const addStudent = useCallback(async (data) => {
    const s = { id: uid(), ...data };
    const saved = await api.createStudent(s);
    dispatch({ type: "ADD_STUDENT", payload: saved });
    toast(`${s.name} added successfully.`, "success");
    return saved;
  }, [toast]);

  const updateStudent = useCallback(async (id, data) => {
    const saved = await api.updateStudent(id, data);
    dispatch({ type: "UPD_STUDENT", payload: saved });
    toast(`${saved.name} updated.`, "success");
    return saved;
  }, [toast]);

  const deleteStudent = useCallback(async (id, name) => {
    await api.deleteStudent(id);
    dispatch({ type: "DEL_STUDENT", payload: id });
    toast(`${name} deleted.`, "info");
  }, [toast]);

  const bulkAddStudents = useCallback(async (students) => {
    await api.bulkStudents(students);
    // Reload to get merged state
    const data = await api.getData();
    dispatch({ type: "LOAD", payload: { ...data, loading: false } });
    toast(`${students.length} students imported.`, "success");
  }, []);

  // ── Record actions ────────────────────────────────────
  const saveRecord = useCallback(async (formData) => {
    const computed = calcScores(formData);
    const record   = { id: uid(), ...formData, computed };
    const saved    = await api.saveRecord(record);
    dispatch({ type: "SAVE_RECORD", payload: saved });
    toast(`✓ Saved — WPI: ${computed.WPI.toFixed(1)} | Band ${computed.band}`, "success");
    return saved;
  }, [toast]);

  const bulkSaveRecords = useCallback(async (records) => {
    await api.bulkRecords(records);
    dispatch({ type: "BULK_RECORDS", payload: records });
    toast(`${records.length} records imported.`, "success");
  }, [toast]);

  // ── Week actions ──────────────────────────────────────
  const addWeek = useCallback(async (customLabel) => {
    const w = (customLabel || "").trim() || isoWeek();
    if (state.weeks.includes(w)) {
      toast(`"${w}" already exists.`, "error");
      return;
    }
    await api.saveSettings({ weeks: [...state.weeks, w], activeWeek: w });
    dispatch({ type: "ADD_WEEK", payload: w });
    toast(`Week "${w}" created and set as active.`, "success");
    return w;
  }, [state.weeks, toast]);

  const setActiveWeek = useCallback(async (w) => {
    await api.saveSettings({ weeks: state.weeks, activeWeek: w });
    dispatch({ type: "SET_WEEK", payload: w });
  }, [state.weeks]);

  // ── Derived helpers ───────────────────────────────────
  const getTrend = useCallback((studentId) =>
    calcTrend(studentId, state.records, state.weeks), [state.records, state.weeks]);

  const getLatestRecord = useCallback((studentId) =>
    state.records
      .filter(r => r.studentId === studentId)
      .sort((a, b) => b.week.localeCompare(a.week))[0], [state.records]);

  return (
    <DBCtx.Provider value={{
      ...state,
      toastRef,
      addStudent, updateStudent, deleteStudent, bulkAddStudents,
      saveRecord, bulkSaveRecords,
      addWeek, setActiveWeek,
      getTrend, getLatestRecord,
    }}>
      {children}
    </DBCtx.Provider>
  );
}
