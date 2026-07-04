export default function SortableTh({ label, col, sort, onSort, className = "" }) {
  if (!onSort) return <th className={className}>{label}</th>;
  const active = sort?.col === col;
  const cls    = [active ? `sort-${sort.dir}` : "sortable", className].filter(Boolean).join(" ");
  return (
    <th className={cls} onClick={() => onSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label}
    </th>
  );
}
