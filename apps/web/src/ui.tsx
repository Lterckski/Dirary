import { useEffect, useRef } from 'react';

/** Opens the browser's date or time picker as soon as the field is clicked, not only from its small icon. */
export function openPicker(event: React.MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Some browsers only allow this in certain cases; the field still works by typing.
  }
}

/** A native <dialog>: focus trap, Escape to close and the backdrop come from the browser. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
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

