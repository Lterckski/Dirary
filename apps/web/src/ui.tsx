import { useEffect, useRef } from 'react';

/** A native <dialog>: focus trap, Escape to close and the backdrop come from the browser. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // showModal focuses the first button; put the cursor in the field marked for it instead.
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal-body">
        <h2 id="modal-title" className="display" style={{ fontSize: 26 }}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

