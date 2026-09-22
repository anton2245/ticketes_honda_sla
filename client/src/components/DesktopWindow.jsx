import React, { useState, useRef, useEffect } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

let globalZIndex = 1000;

export default function DesktopWindow({
  title,
  icon: Icon,
  onClose,
  children,
  defaultWidth = '680px',
  defaultHeight = 'auto',
  maxWidth = '95vw',
  maxHeight = '90vh',
  style = {}
}) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [zIndex, setZIndex] = useState(() => ++globalZIndex);

  const windowRef = useRef(null);

  const bringToFront = () => {
    setZIndex(++globalZIndex);
  };

  const handleMouseDownHeader = (e) => {
    if (e.target.closest('button')) return; // Don't drag when clicking titlebar buttons
    bringToFront();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: Math.max(-20, e.clientY - dragOffset.y)
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const toggleMaximize = () => {
    bringToFront();
    setIsMaximized(!isMaximized);
  };

  const toggleMinimize = () => {
    bringToFront();
    setIsMinimized(!isMinimized);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        ref={windowRef}
        onMouseDown={bringToFront}
        style={{
          pointerEvents: 'auto',
          position: isMaximized ? 'fixed' : 'relative',
          top: isMaximized ? 0 : `${position.y}px`,
          left: isMaximized ? 0 : `${position.x}px`,
          width: isMaximized ? '100vw' : defaultWidth,
          height: isMinimized ? 'auto' : isMaximized ? '100vh' : defaultHeight,
          maxWidth: isMaximized ? '100vw' : maxWidth,
          maxHeight: isMinimized ? '44px' : isMaximized ? '90vh' : maxHeight,
          backgroundColor: '#ffffff',
          borderRadius: isMaximized ? '0' : '10px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          resize: isMaximized || isMinimized ? 'none' : 'both',
          transition: isDragging ? 'none' : 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          ...style
        }}
      >
        {/* Title bar */}
        <div
          onMouseDown={handleMouseDownHeader}
          onDoubleClick={toggleMaximize}
          style={{
            height: '42px',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none',
            cursor: isDragging ? 'grabbing' : 'grab',
            borderBottom: '1px solid #334155'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13.5px' }}>
            {Icon && <Icon size={16} style={{ color: '#f87171' }} />}
            <span>{title}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={toggleMinimize}
              title={isMinimized ? "Expand" : "Minimize"}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={toggleMaximize}
              title={isMaximized ? "Restore" : "Maximize"}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#334155'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {isMaximized ? <Copy size={13} /> : <Square size={13} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close (Alt+F4)"
              style={{
                background: '#dc2626',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                marginLeft: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Window Body */}
        {!isMinimized && (
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff'
            }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
