import React from 'react';

export function KanbanCardSkeleton() {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        padding: '12px',
        marginBottom: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        animation: 'pulse 1.5s ease-in-out infinite'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: '70px', height: '18px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
        <div style={{ width: '45px', height: '18px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
      </div>
      <div style={{ width: '140px', height: '14px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
      <div style={{ width: '100px', height: '12px', backgroundColor: '#f1f5f9', borderRadius: '4px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <div style={{ width: '50px', height: '16px', backgroundColor: '#f1f5f9', borderRadius: '10px' }} />
        <div style={{ width: '60px', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols = 6 }) {
  return (
    <tr style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 14px' }}>
          <div style={{ height: '14px', backgroundColor: '#e2e8f0', borderRadius: '4px', width: i === 0 ? '60%' : '80%' }} />
        </td>
      ))}
    </tr>
  );
}

export function CatalogCardSkeleton() {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        animation: 'pulse 1.5s ease-in-out infinite'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: '90px', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
        <div style={{ width: '40px', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '10px' }} />
      </div>
      <div style={{ width: '180px', height: '14px', backgroundColor: '#e2e8f0', borderRadius: '4px' }} />
      <div style={{ width: '110px', height: '12px', backgroundColor: '#f1f5f9', borderRadius: '4px' }} />
    </div>
  );
}
