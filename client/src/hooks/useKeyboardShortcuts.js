import { useEffect } from 'react';

export function useKeyboardShortcuts({
  onNewTicket,
  onFocusSearch,
  onViewKanban,
  onViewTable,
  onCloseModal,
  onRefresh,
  onToggleHelp,
  onToggleSidebar,
  onSelectHub,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );

      // Escape always closes open modals
      if (e.key === 'Escape') {
        if (onCloseModal) {
          onCloseModal();
          return;
        }
      }

      // Alt+N for New Ticket (works everywhere)
      if ((e.altKey && (e.key === 'n' || e.key === 'N'))) {
        e.preventDefault();
        onNewTicket && onNewTicket();
        return;
      }

      // Alt+F or '/' for Search focus
      if ((e.altKey && (e.key === 'f' || e.key === 'F')) || (!isInput && e.key === '/')) {
        e.preventDefault();
        onFocusSearch && onFocusSearch();
        return;
      }

      // Alt+Number to switch hubs directly
      if (e.altKey && onSelectHub) {
        if (e.key === '1') { e.preventDefault(); onSelectHub('BOARD'); return; }
        if (e.key === '2') { e.preventDefault(); onSelectHub('CUSTOMERS'); return; }
        if (e.key === '3') { e.preventDefault(); onSelectHub('VEHICLES'); return; }
        if (e.key === '4') { e.preventDefault(); onSelectHub('INVENTORY'); return; }
        if (e.key === '5') { e.preventDefault(); onSelectHub('INSURANCE'); return; }
      }

      // Toggle Sidebar with [ or Ctrl+B
      if (e.key === '[' || (e.ctrlKey && (e.key === 'b' || e.key === 'B'))) {
        e.preventDefault();
        onToggleSidebar && onToggleSidebar();
        return;
      }

      // If user is inside an input, do not trigger single-key navigation shortcuts
      if (isInput) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNewTicket && onNewTicket();
      } else if (e.key === '1') {
        onViewKanban && onViewKanban();
      } else if (e.key === '2') {
        onViewTable && onViewTable();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onRefresh && onRefresh();
      } else if (e.key === '?') {
        e.preventDefault();
        onToggleHelp && onToggleHelp();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onNewTicket,
    onFocusSearch,
    onViewKanban,
    onViewTable,
    onCloseModal,
    onRefresh,
    onToggleHelp,
    onToggleSidebar,
    onSelectHub
  ]);
}
