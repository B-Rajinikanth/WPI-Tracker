export default function Modal({ id, title, children, size = "" }) {
  return (
    <div id={id} className="modal-overlay">
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={() => document.getElementById(id)?.classList.remove("open")}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const openModal  = id => document.getElementById(id)?.classList.add("open");
export const closeModal = id => document.getElementById(id)?.classList.remove("open");
