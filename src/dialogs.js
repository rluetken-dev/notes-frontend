// dialogs.js
// Small modal-backed confirm dialog
// -------------------------------------------------
// Provides a Promise-based confirm() that shows a modal,
// resolves to true (confirmed) or false (cancelled / dismissed)
// and handles basic keyboard/backdrop interactions.

/**
 * Show the confirm modal and resolve with the user's choice.
 *
 * @param {Object}   [options]
 * @param {string}   [options.title='Notiz löschen?'] - Modal heading text.
 * @param {string}   [options.text='Diese Aktion kann nicht rückgängig gemacht werden.'] - Body/description text.
 * @returns {Promise<boolean>} Resolves `true` when confirmed, `false` otherwise.
 *
 * Usage:
 *   const ok = await confirmDialog({ title: 'Delete?', text: 'This cannot be undone.' });
 *   if (ok) { /* proceed *\/ }
 */
export function confirmDialog({
  title = 'Notiz löschen?',
  text = 'Diese Aktion kann nicht rückgängig gemacht werden.',
} = {}) {
  // Grab all required modal elements from the DOM.
  // NOTE: This function assumes that these elements exist in index.html.
  const confirmModal = document.getElementById('confirm-modal');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmText = document.getElementById('confirm-text');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');
  const confirmBackdrop = confirmModal?.querySelector('.modal-backdrop');

  return new Promise((resolve) => {
    // Inject dynamic content (title + description) for the current action.
    confirmTitle.textContent = title;
    confirmText.textContent = text;

    // Show the modal and prevent body scroll while it is open.
    confirmModal.hidden = false;
    document.body.classList.add('no-scroll');

    // ---- Event handlers ----
    // Success path: user clicked "OK"
    const onOk = () => cleanup(true);
    // Cancel paths: user clicked "Cancel" or backdrop, or hit Escape
    const onCancel = () => cleanup(false);
    const onBack = () => cleanup(false);
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false); // ESC = cancel
      if (e.key === 'Enter') cleanup(true); // Enter = confirm
    };

    /**
     * Tear down all listeners, hide the modal, restore scroll,
     * and resolve the promise with the given result.
     * @param {boolean} result
     */
    function cleanup(result) {
      confirmOk.removeEventListener('click', onOk);
      confirmCancel.removeEventListener('click', onCancel);
      confirmBackdrop?.removeEventListener('click', onBack);
      document.removeEventListener('keydown', onKey);

      confirmModal.hidden = true;
      document.body.classList.remove('no-scroll');

      resolve(result);
    }

    // ---- Wire listeners (once where appropriate) ----
    // { once: true } auto-removes the listener after the first invocation,
    // which helps avoid leaks if the dialog is opened repeatedly.
    confirmOk.addEventListener('click', onOk, { once: true });
    confirmCancel.addEventListener('click', onCancel, { once: true });
    confirmBackdrop?.addEventListener('click', onBack, { once: true });
    document.addEventListener('keydown', onKey);

    // Move focus to the primary action for quick keyboard confirm (Enter).
    // NOTE: setTimeout ensures focus runs after the element is visible.
    setTimeout(() => confirmOk.focus(), 0);
  });
}
