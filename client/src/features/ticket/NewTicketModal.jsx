import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Car, User } from 'lucide-react';
import { lookupCustomers } from '../../api/customers.js';
import { fetchVehicles } from '../../api/vehicles.js';
import DesktopWindow from '../../components/DesktopWindow.jsx';
import InsuranceSelect from '../../components/InsuranceSelect.jsx';

export default function NewTicketModal({
  outlets = [],
  selectedOutletId,
  onClose,
  onSubmit,
  isSubmitting,
}) {
  const initialOutletId = (selectedOutletId && selectedOutletId !== 'ALL')
    ? Number(selectedOutletId)
    : (outlets[0]?.id || 2);
  const [outletId, setOutletId] = useState(initialOutletId);

  useEffect(() => {
    if (outlets.length > 0) {
      if (!outletId || !outlets.some(o => Number(o.id) === Number(outletId))) {
        const valid = (selectedOutletId && selectedOutletId !== 'ALL' && outlets.some(o => Number(o.id) === Number(selectedOutletId)))
          ? Number(selectedOutletId)
          : outlets[0].id;
        setOutletId(valid);
      }
    }
  }, [outlets, selectedOutletId]);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vin, setVin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [damagedParts, setDamagedParts] = useState('');

  // Suggestive dropdown states
  const [vehicleSuggestions, setVehicleSuggestions] = useState([]);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  useEffect(() => {
    if (vehiclePlate.length >= 2) {
      fetchVehicles({ q: vehiclePlate })
        .then(res => {
          if (Array.isArray(res)) setVehicleSuggestions(res);
          else setVehicleSuggestions([]);
        })
        .catch(() => setVehicleSuggestions([]));
    } else {
      setVehicleSuggestions([]);
    }
  }, [vehiclePlate]);

  useEffect(() => {
    if (customerName.length >= 2) {
      lookupCustomers(customerName)
        .then(res => {
          if (Array.isArray(res)) setCustomerSuggestions(res);
          else setCustomerSuggestions([]);
        })
        .catch(() => setCustomerSuggestions([]));
    } else {
      setCustomerSuggestions([]);
    }
  }, [customerName]);

  const selectVehicle = (v) => {
    setVehiclePlate(v.vehicle_no || v.plate_number || '');
    setVehicleModel(v.model || v.model_name || v.vehicle_name || '');
    setVehicleColor(v.color || '');
    setVin(v.chassis_no || v.vin || '');
    if (v.customer_name && !customerName) {
      setCustomerName(v.customer_name);
    }
    if (v.customer_phone && !customerPhone) {
      setCustomerPhone(v.customer_phone);
    }
    setShowVehicleDropdown(false);
  };

  const selectCustomer = (c) => {
    setCustomerName(c.customer_name || c.name || '');
    setCustomerPhone(c.primary_phone || c.phone || '');
    if (c.vehicle_no && !vehiclePlate) {
      setVehiclePlate(c.vehicle_no);
      if (c.model || c.vehicle_name) setVehicleModel(c.model || c.vehicle_name);
      if (c.color) setVehicleColor(c.color);
      if (c.chassis_no) setVin(c.chassis_no);
    }
    setShowCustomerDropdown(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!vehiclePlate.trim() || !customerName.trim()) return;

    onSubmit({
      outletId: Number(outletId),
      outlet_id: Number(outletId),
      branchId: Number(outletId),
      vehicleNo: vehiclePlate.trim().toUpperCase(),
      vehicle_no: vehiclePlate.trim().toUpperCase(),
      vehicle_plate: vehiclePlate.trim().toUpperCase(),
      model: vehicleModel.trim() || 'Honda Vehicle',
      vehicle_model: vehicleModel.trim() || 'Honda Vehicle',
      vehicleName: vehicleModel.trim() || 'Honda Vehicle',
      color: vehicleColor.trim() || '',
      vehicle_color: vehicleColor.trim() || '',
      chassisNumber: vin.trim() || '',
      chassis_number: vin.trim() || '',
      vin: vin.trim() || '',
      customerName: customerName.trim(),
      customer_name: customerName.trim(),
      customerPhone: customerPhone.trim() || '',
      customer_phone: customerPhone.trim() || '',
      insuranceCompany: insuranceCompany.trim() || null,
      insurance_company: insuranceCompany.trim() || null,
      damagedParts: damagedParts.trim() || '',
      damaged_parts: damagedParts.trim() || '',
      current_stage_id: 1,
    });
  };

  return (
    <DesktopWindow
      title="Intake New Vehicle Ticket (Stage 1)"
      icon={Car}
      onClose={onClose}
      defaultWidth="640px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="modal-body">
            {outlets.length > 1 && (
              <div className="form-group">
                <label className="form-label">Service Outlet / Bodyshop Location *</label>
                <select
                  className="form-select"
                  value={outletId}
                  onChange={e => setOutletId(e.target.value)}
                  required
                >
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Vehicle Details with Suggestive Autocomplete */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Vehicle Registration Plate *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. DL 01 AB 1234"
                  value={vehiclePlate}
                  onChange={e => {
                    setVehiclePlate(e.target.value.toUpperCase());
                    setShowVehicleDropdown(true);
                  }}
                  onFocus={() => { if (vehicleSuggestions.length > 0) setShowVehicleDropdown(true); }}
                  style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                />
                {showVehicleDropdown && vehicleSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '4px',
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    zIndex: 60,
                  }}>
                    <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: 'var(--text-subtle)', backgroundColor: '#f8fafc' }}>
                      MATCHING VEHICLES (CLICK TO AUTO-FILL)
                    </div>
                    {vehicleSuggestions.map((v, i) => (
                      <div
                        key={i}
                        onMouseDown={() => selectVehicle(v)}
                        style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                      >
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{v.vehicle_no || v.plate_number}</strong> • {v.model || v.vehicle_name || v.model_name}
                        {v.customer_name && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({v.customer_name})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Vehicle Model *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Honda City ZX, Elevate, Activa"
                  value={vehicleModel}
                  onChange={e => setVehicleModel(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Color (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Platinum White Pearl, Radiant Red"
                  value={vehicleColor}
                  onChange={e => setVehicleColor(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">VIN / Chassis # (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. MA3E..."
                  value={vin}
                  onChange={e => setVin(e.target.value.toUpperCase())}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            {/* Customer Details with Suggestive Autocomplete */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Customer Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Amit Sharma"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => { if (customerSuggestions.length > 0) setShowCustomerDropdown(true); }}
                />
                {showCustomerDropdown && customerSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '4px',
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    zIndex: 60,
                  }}>
                    <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: 'var(--text-subtle)', backgroundColor: '#f8fafc' }}>
                      MATCHING CRM CUSTOMERS (CLICK TO AUTO-FILL)
                    </div>
                    {customerSuggestions.map((c, i) => (
                      <div
                        key={i}
                        onMouseDown={() => selectCustomer(c)}
                        style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                      >
                        <strong>{c.customer_name || c.name}</strong> • {c.primary_phone || c.phone}
                        {c.vehicle_no && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({c.vehicle_no})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Customer Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="e.g. 98201 12345"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Insurance Autocomplete Dropdown */}
            <div className="form-group">
              <label className="form-label">Insurance Company (Optional)</label>
              <InsuranceSelect
                value={insuranceCompany}
                onChange={(val) => setInsuranceCompany(val)}
                required={false}
                placeholder="e.g. ICICI Lombard General Insurance, HDFC ERGO..."
              />
            </div>

            {/* Initial Notes */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Initial Vehicle Intake Remarks</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Vehicle towed in after front-end collision..."
                value={damagedParts}
                onChange={e => setDamagedParts(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <CheckCircle2 size={14} />
              <span>{isSubmitting ? 'Creating Ticket...' : 'Create Job Ticket'}</span>
            </button>
          </div>
        </form>
    </DesktopWindow>
  );
}
