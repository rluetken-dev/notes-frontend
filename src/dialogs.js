// dialogs.js
// Small modal-backed confirm dialog

/** Show confirm modal and resolve true/false. */
export function confirmDialog({
  title = 'Notiz löschen?',
  text = 'Diese Aktion kann nicht rückgängig gemacht werden.',
} = {}) {
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmText = document.getElementById('confirm-text');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');
  const confirmBackdrop = confirmModal?.querySelector('.modal-backdrop');

  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmModal.hidden = false;
    document.body.classList.add('no-scroll');

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBack = () => cleanup(false);
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };

    function cleanup(result) {
      confirmOk.removeEventListener('click', onOk);
      confirmCancel.removeEventListener('click', onCancel);
      confirmBackdrop?.removeEventListener('click', onBack);
      document.removeEventListener('keydown', onKey);
      confirmModal.hidden = true;
      document.body.classList.remove('no-scroll');
      resolve(result);
    }

    confirmOk.addEventListener('click', onOk, { once: true });
    confirmCancel.addEventListener('click', onCancel, { once: true });
    confirmBackdrop?.addEventListener('click', onBack, { once: true });
    document.addEventListener('keydown', onKey);
    setTimeout(() => confirmOk.focus(), 0);
  });
}
