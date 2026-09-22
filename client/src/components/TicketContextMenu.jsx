import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FileText,
  History,
  MessageSquare,
  UserPlus,
  ChevronRight,
  Printer,
  FileSpreadsheet,
  Wrench,
  Trash2,
  Car,
  MoreHorizontal,
  PackageCheck,
  ShoppingCart
} from 'lucide-react';

export default function TicketContextMenu({
  ticket,
  x,
  y,
  onClose,
  onDetails,
  onTimeline,
  onComment,
  onAssign,
  onEstimatePrint,
  onEstimateXlsx,
  onPartsStatus,
  onOrder,
  onArrival,
  onDelete,
}) {
  const menuRef = useRef(null);
  const moreItemRef = useRef(null);
  const otherItemRef = useRef(null);
  const submenuRef = useRef(null);
  const otherSubmenuRef = useRef(null);
  const moreCloseTimer = useRef(null);
  const otherCloseTimer = useRef(null);

  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [isOtherSubmenuOpen, setIsOtherSubmenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: y, left: x });
  const [submenuFlipLeft, setSubmenuFlipLeft] = useState(false);
  const [submenuFlipTop, setSubmenuFlipTop] = useState(false);
  const [otherFlipLeft, setOtherFlipLeft] = useState(false);

  // Generous 450ms hover grace period to prevent accidental closing on minute mouse movements
  const handleMoreEnter = () => {
    if (moreCloseTimer.current) {
      clearTimeout(moreCloseTimer.current);
      moreCloseTimer.current = null;
    }
    setIsSubmenuOpen(true);
  };

  const handleMoreLeave = () => {
    moreCloseTimer.current = setTimeout(() => {
      setIsSubmenuOpen(false);
      setIsOtherSubmenuOpen(false);
    }, 450);
  };

  const handleOtherEnter = () => {
    if (otherCloseTimer.current) {
      clearTimeout(otherCloseTimer.current);
      otherCloseTimer.current = null;
    }
    if (moreCloseTimer.current) {
      clearTimeout(moreCloseTimer.current);
      moreCloseTimer.current = null;
    }
    setIsSubmenuOpen(true);
    setIsOtherSubmenuOpen(true);
  };

  const handleOtherLeave = () => {
    otherCloseTimer.current = setTimeout(() => {
      setIsOtherSubmenuOpen(false);
    }, 450);
  };

  useEffect(() => {
    return () => {
      if (moreCloseTimer.current) clearTimeout(moreCloseTimer.current);
      if (otherCloseTimer.current) clearTimeout(otherCloseTimer.current);
    };
  }, []);

  // Position adjustments to prevent overflow beyond viewport boundaries
  useEffect(() => {
    const menuWidth = 190;
    const menuHeight = 220;
    const padding = 10;

    let posX = x;
    let posY = y;

    if (x + menuWidth + padding > window.innerWidth) {
      posX = Math.max(padding, window.innerWidth - menuWidth - padding);
    }
    if (y + menuHeight + padding > window.innerHeight) {
      posY = Math.max(padding, window.innerHeight - menuHeight - padding);
    }

    setMenuPos({ top: posY, left: posX });

    // Check if submenus will overflow right edge
    const flipSubmenuLeft = posX + menuWidth + 185 > window.innerWidth - padding;
    setSubmenuFlipLeft(flipSubmenuLeft);

    if (flipSubmenuLeft) {
      // Level 2 is to the left of Level 1. Level 3 also goes left unless it hits left edge.
      const hasRoomOnLeft = (posX - 185 - 180) >= padding;
      setOtherFlipLeft(hasRoomOnLeft);
    } else {
      // Level 2 is to the right of Level 1. Level 3 goes right unless it hits right edge.
      const willOverflowRight = (posX + menuWidth + 185 + 180) > window.innerWidth - padding;
      setOtherFlipLeft(willOverflowRight);
    }

    // Check if submenu will overflow bottom edge
    // Main menu top is posY, 'More' item is ~160px down, submenu height is ~200px
    if (posY + 160 + 200 > window.innerHeight - padding) {
      setSubmenuFlipTop(true);
    } else {
      setSubmenuFlipTop(false);
    }
  }, [x, y]);

  // Viewport vertical clamping for More submenu (Level 2)
  useLayoutEffect(() => {
    if (isSubmenuOpen && submenuRef.current) {
      const el = submenuRef.current;
      const rect = el.getBoundingClientRect();
      const padding = 8;

      if (rect.bottom > window.innerHeight - padding) {
        const overflow = rect.bottom - (window.innerHeight - padding);
        const currentTop = el.offsetTop;
        el.style.top = `${currentTop - overflow}px`;
        el.style.bottom = 'auto';
      } else if (rect.top < padding) {
        const underflow = padding - rect.top;
        const currentTop = el.offsetTop;
        el.style.top = `${currentTop + underflow}px`;
        el.style.bottom = 'auto';
      }
    }
  }, [isSubmenuOpen, submenuFlipTop, submenuFlipLeft]);

  // Viewport vertical clamping for Other submenu (Level 3)
  useLayoutEffect(() => {
    if (isOtherSubmenuOpen && otherSubmenuRef.current) {
      const el = otherSubmenuRef.current;
      const rect = el.getBoundingClientRect();
      const padding = 8;

      if (rect.bottom > window.innerHeight - padding) {
        const overflow = rect.bottom - (window.innerHeight - padding);
        const currentTop = el.offsetTop;
        el.style.top = `${currentTop - overflow}px`;
        el.style.bottom = 'auto';
      } else if (rect.top < padding) {
        const underflow = padding - rect.top;
        const currentTop = el.offsetTop;
        el.style.top = `${currentTop + underflow}px`;
        el.style.bottom = 'auto';
      }
    }
  }, [isOtherSubmenuOpen]);

  // Click outside, scroll, and escape key dismiss
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('pointerdown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  if (!ticket) return null;

  const stageId = Number(ticket.current_stage_id) || 1;

  // Stage-specific options determination
  // Stage 1: Details, Timeline, Comment, Assign, More > Delete
  // Stage 2 & 3: Details, Timeline, Comment, Assign, More > Other > (Estimate Print, Estimate XLSX), Parts Status, Delete
  // Stage 4+: Details, Timeline, Comment, Assign, More > Other > (Estimate Print, Estimate XLSX), Parts Status, Delete
  const hasOtherOptions = stageId >= 2;
  const hasPartsStatus = stageId >= 2;
  const hasOrder = stageId >= 4 || (Number(ticket?.total_parts_count) > 0);
  const hasArrival = stageId >= 5 || (Number(ticket?.total_parts_count) > 0);
  const hasDelete = true;

  const handleAction = (callback) => (e) => {
    e.stopPropagation();
    onClose();
    if (callback) callback(ticket);
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        top: `${menuPos.top}px`,
        left: `${menuPos.left}px`,
        zIndex: 99999,
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
        minWidth: '185px',
        padding: '5px',
        userSelect: 'none',
        animation: 'fadeInMenu 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Context Target Header */}
      <div style={{
        padding: '6px 10px 8px',
        borderBottom: '1px solid #f1f5f9',
        marginBottom: '4px',
        fontSize: '11px',
        color: 'var(--text-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
          <Car size={12} color="var(--honda-red)" />
          <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>
            {ticket.vehicle_plate || ticket.vehicle_no || ticket.ticket_number || `#${ticket.id}`}
          </span>
        </div>
        <span style={{
          backgroundColor: '#eff6ff',
          color: '#1d4ed8',
          padding: '1px 5px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 700
        }}>
          S{stageId}
        </span>
      </div>

      {/* 1. Details */}
      <button
        type="button"
        className="context-menu-item"
        onClick={handleAction(onDetails)}
        style={itemStyle}
        onMouseEnter={itemHover}
        onMouseLeave={itemUnhover}
      >
        <FileText size={14} color="#475569" />
        <span>Details</span>
      </button>

      {/* 2. Timeline */}
      <button
        type="button"
        className="context-menu-item"
        onClick={handleAction(onTimeline)}
        style={itemStyle}
        onMouseEnter={itemHover}
        onMouseLeave={itemUnhover}
      >
        <History size={14} color="#475569" />
        <span>Timeline</span>
      </button>

      {/* 3. Comment */}
      <button
        type="button"
        className="context-menu-item"
        onClick={handleAction(onComment)}
        style={itemStyle}
        onMouseEnter={itemHover}
        onMouseLeave={itemUnhover}
      >
        <MessageSquare size={14} color="#475569" />
        <span>Comment</span>
      </button>

      {/* 4. Assign */}
      <button
        type="button"
        className="context-menu-item"
        onClick={handleAction(onAssign)}
        style={itemStyle}
        onMouseEnter={itemHover}
        onMouseLeave={itemUnhover}
      >
        <UserPlus size={14} color="#475569" />
        <span>Assign</span>
      </button>

      {/* 5. More > (Flyout Submenu) */}
      <div
        ref={moreItemRef}
        style={{ position: 'relative' }}
        onMouseEnter={handleMoreEnter}
        onMouseLeave={handleMoreLeave}
      >
        <button
          type="button"
          className="context-menu-item"
          onClick={(e) => {
            e.stopPropagation();
            if (moreCloseTimer.current) clearTimeout(moreCloseTimer.current);
            setIsSubmenuOpen(prev => !prev);
          }}
          style={{
            ...itemStyle,
            justifyContent: 'space-between',
            backgroundColor: isSubmenuOpen ? '#f1f5f9' : 'transparent'
          }}
          onMouseEnter={handleMoreEnter}
          onMouseLeave={(e) => {
            if (!isSubmenuOpen) itemUnhover(e);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>More</span>
          </div>
          <ChevronRight size={13} color="#64748b" />
        </button>

        {/* Level 2 Submenu Popout (More > ...) */}
        {isSubmenuOpen && (
          <div
            ref={submenuRef}
            onMouseEnter={handleMoreEnter}
            onMouseLeave={handleMoreLeave}
            style={{
              position: 'absolute',
              top: submenuFlipTop ? 'auto' : '-4px',
              bottom: submenuFlipTop ? '-4px' : 'auto',
              left: submenuFlipLeft ? 'auto' : 'calc(100% - 2px)',
              right: submenuFlipLeft ? 'calc(100% - 2px)' : 'auto',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
              minWidth: '185px',
              padding: '5px',
              zIndex: 100000,
              animation: 'fadeInMenu 0.1s ease',
            }}
          >
            {/* more > other > (estimate print, estimate xlsx) */}
            {hasOtherOptions && (
              <div
                ref={otherItemRef}
                style={{ position: 'relative' }}
                onMouseEnter={handleOtherEnter}
                onMouseLeave={handleOtherLeave}
              >
                <button
                  type="button"
                  className="context-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (otherCloseTimer.current) clearTimeout(otherCloseTimer.current);
                    setIsOtherSubmenuOpen(prev => !prev);
                  }}
                  style={{
                    ...itemStyle,
                    justifyContent: 'space-between',
                    backgroundColor: isOtherSubmenuOpen ? '#f1f5f9' : 'transparent'
                  }}
                  onMouseEnter={handleOtherEnter}
                  onMouseLeave={(e) => {
                    if (!isOtherSubmenuOpen) itemUnhover(e);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MoreHorizontal size={14} color="#0284c7" />
                    <span style={{ fontWeight: 500 }}>Other</span>
                  </div>
                  <ChevronRight size={13} color="#64748b" />
                </button>

                {/* Level 3 Submenu Popout (more > other > ...) */}
                {isOtherSubmenuOpen && (
                  <div
                    ref={otherSubmenuRef}
                    onMouseEnter={handleOtherEnter}
                    onMouseLeave={handleOtherLeave}
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      left: otherFlipLeft ? 'auto' : 'calc(100% - 2px)',
                      right: otherFlipLeft ? 'calc(100% - 2px)' : 'auto',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                      minWidth: '180px',
                      padding: '5px',
                      zIndex: 100001,
                      animation: 'fadeInMenu 0.1s ease',
                    }}
                  >
                    {/* more > other > estimate print */}
                    <button
                      type="button"
                      className="context-menu-item"
                      onClick={handleAction(onEstimatePrint)}
                      style={itemStyle}
                      onMouseEnter={itemHover}
                      onMouseLeave={itemUnhover}
                    >
                      <Printer size={14} color="#0284c7" />
                      <span>Estimate Print</span>
                    </button>

                    {/* more > other > estimate xlsx */}
                    <button
                      type="button"
                      className="context-menu-item"
                      onClick={handleAction(onEstimateXlsx)}
                      style={itemStyle}
                      onMouseEnter={itemHover}
                      onMouseLeave={itemUnhover}
                    >
                      <FileSpreadsheet size={14} color="#059669" />
                      <span>Estimate XLSX</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Parts Status (Stages 2-13) */}
            {hasPartsStatus && (
              <button
                type="button"
                className="context-menu-item"
                onClick={handleAction(onPartsStatus)}
                style={itemStyle}
                onMouseEnter={itemHover}
                onMouseLeave={itemUnhover}
              >
                <Wrench size={14} color="#d97706" />
                <span>Parts Status</span>
              </button>
            )}

            {/* Order (Stages 4-13 or tickets with parts) */}
            {hasOrder && (
              <button
                type="button"
                className="context-menu-item"
                onClick={handleAction(onOrder)}
                style={itemStyle}
                onMouseEnter={itemHover}
                onMouseLeave={itemUnhover}
              >
                <ShoppingCart size={14} color="#ea580c" />
                <span>Order</span>
              </button>
            )}

            {/* Arrival (Stages 5-13 or tickets with parts) */}
            {hasArrival && (
              <button
                type="button"
                className="context-menu-item"
                onClick={handleAction(onArrival)}
                style={itemStyle}
                onMouseEnter={itemHover}
                onMouseLeave={itemUnhover}
              >
                <PackageCheck size={14} color="#059669" />
                <span>Arrival</span>
              </button>
            )}

            {/* Delete (All Stages in More menu) */}
            {hasDelete && (
              <button
                type="button"
                className="context-menu-item context-menu-delete"
                onClick={handleAction(onDelete)}
                style={{
                  ...itemStyle,
                  color: 'var(--honda-red)',
                  borderTop: (hasOtherOptions || hasPartsStatus || hasOrder || hasArrival) ? '1px solid #f1f5f9' : 'none',
                  marginTop: (hasOtherOptions || hasPartsStatus || hasOrder || hasArrival) ? '3px' : '0',
                  paddingTop: (hasOtherOptions || hasPartsStatus || hasOrder || hasArrival) ? '7px' : '7px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--honda-red-light)';
                  e.currentTarget.style.color = 'var(--honda-red-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--honda-red)';
                }}
              >
                <Trash2 size={14} color="var(--honda-red)" />
                <span style={{ fontWeight: 600 }}>Delete</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const itemStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '7px 10px',
  fontSize: '12.5px',
  fontWeight: 500,
  color: '#1e293b',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: '5px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.1s ease',
  outline: 'none',
};

function itemHover(e) {
  e.currentTarget.style.backgroundColor = '#f1f5f9';
}

function itemUnhover(e) {
  e.currentTarget.style.backgroundColor = 'transparent';
}
