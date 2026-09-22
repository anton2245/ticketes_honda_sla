import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

export default function NetworkErrorBanner({ onReconnectSync }) {
  const { isConnected, isOnline, isRetrying, retry } = useNetworkStatus();
  const [showRestored, setShowRestored] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setWasDisconnected(true);
      setShowRestored(false);
    } else if (wasDisconnected && isConnected) {
      setShowRestored(true);
      if (onReconnectSync) {
        onReconnectSync();
      }
      const timer = setTimeout(() => {
        setShowRestored(false);
        setWasDisconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, wasDisconnected, onReconnectSync]);

  if (isConnected && !showRestored) {
    return null;
  }

  // Connection Restored Toast Banner
  if (isConnected && showRestored) {
    return (
      <>
        <style>{`
          @keyframes netFadeInDown {
            from { opacity: 0; transform: translate(-50%, -10px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
          @keyframes netSlideDown {
            from { opacity: 0; transform: translateY(-100%); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes netSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .net-spin {
            animation: netSpin 0.8s linear infinite;
          }
        `}</style>
        <div style={{
          position: 'fixed',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: '#065f46',
          color: '#ffffff',
          padding: '8px 20px',
          borderRadius: '24px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
          fontSize: '13px',
          fontWeight: 600,
          animation: 'netFadeInDown 0.25s ease',
        }}>
          <CheckCircle2 size={16} color="#34d399" />
          <span>Connection Restored</span>
        </div>
      </>
    );
  }

  // Offline / Disconnected Warning Overlay Banner
  return (
    <>
      <style>{`
        @keyframes netSlideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes netSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .net-spin {
          animation: netSpin 0.8s linear infinite;
        }
      `}</style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        backgroundColor: '#7f1d1d',
        color: '#ffffff',
        borderBottom: '2px solid #ef4444',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12.5px',
        animation: 'netSlideDown 0.25s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            backgroundColor: '#ef4444',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <WifiOff size={16} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Weak SERVER CONNECTION </span>
            </div>
            <div style={{ opacity: 0.9, fontSize: '11.5px', marginTop: '2px' }}>
              Low Network. Check your connection or try again later.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={retry}
            disabled={isRetrying}
            style={{
              backgroundColor: '#ffffff',
              color: '#7f1d1d',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          >
            <RefreshCw size={13} className={isRetrying ? 'net-spin' : ''} />
            <span>{isRetrying ? 'Checking...' : 'Retry Connection'}</span>
          </button>
        </div>
      </div>
    </>
  );
}
