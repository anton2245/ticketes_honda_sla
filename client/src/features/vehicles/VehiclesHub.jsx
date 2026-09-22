import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Car, Plus, Edit2, Trash2, X, Copy, Phone, User, FileText, Wrench } from 'lucide-react';
import { fetchVehicles, fetchVehicle, createVehicle, updateVehicle, deleteVehicle } from '../../api/vehicles.js';
import { lookupCustomers } from '../../api/customers.js';

export default function VehiclesHub({ onOpenTicket }) {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedVehicleDossier, setSelectedVehicleDossier] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, WORKSHOP, READY
  const [isLoading, setIsLoading] = useState(false);
  const [isDossierLoading, setIsDossierLoading] = useState(false);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Customer suggestion state for registration
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [formData, setFormData] = useState({
    model: '',
    vehicleNo: '',
    color: '',
    chassisNo: '',
  });

  const loadVehicles = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await fetchVehicles({ q: searchQuery });
      setVehicles(list || []);
      if (!selectedVehicleId && list?.length > 0) {
        setSelectedVehicleId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedVehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // Load selected vehicle dossier
  useEffect(() => {
    if (!selectedVehicleId) {
      setSelectedVehicleDossier(null);
      return;
    }
    setIsDossierLoading(true);
    fetchVehicle(selectedVehicleId)
      .then(dossier => {
        setSelectedVehicleDossier(dossier);
      })
      .catch(console.error)
      .finally(() => setIsDossierLoading(false));
  }, [selectedVehicleId]);

  // Handle customer search in new vehicle modal
  useEffect(() => {
    if (!customerQuery.trim() || selectedCustomer) {
      setCustomerSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      lookupCustomers(customerQuery).then(setCustomerSuggestions).catch(console.error);
    }, 200);
    return () => clearTimeout(timer);
  }, [customerQuery, selectedCustomer]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      if (filterType === 'WORKSHOP') return Boolean(v.active_ticket_id);
      if (filterType === 'READY') return !v.active_ticket_id;
      return true;
    });
  }, [vehicles, filterType]);

  const handleCreateVehicle = async (e) => {
    e.preventDefault();
    if (!formData.model) {
      alert('Model is required');
      return;
    }
    try {
      const res = await createVehicle({
        customerId: selectedCustomer?.id || null,
        model: formData.model,
        vehicleNo: formData.vehicleNo,
        color: formData.color,
        chassisNo: formData.chassisNo,
      });
      setIsNewModalOpen(false);
      setFormData({ model: '', vehicleNo: '', color: '', chassisNo: '' });
      setSelectedCustomer(null);
      setCustomerQuery('');
      await loadVehicles();
      if (res?.id) setSelectedVehicleId(res.id);
    } catch (err) {
      alert(`Failed to register vehicle: ${err.message}`);
    }
  };

  const handleUpdateVehicle = async (e) => {
    e.preventDefault();
    if (!selectedVehicleId) return;
    try {
      await updateVehicle(selectedVehicleId, {
        model: formData.model,
        vehicleNo: formData.vehicleNo,
        color: formData.color,
        chassisNo: formData.chassisNo,
      });
      setIsEditModalOpen(false);
      await loadVehicles();
      const updated = await fetchVehicle(selectedVehicleId);
      setSelectedVehicleDossier(updated);
    } catch (err) {
      alert(`Failed to update vehicle: ${err.message}`);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!selectedVehicleId) return;
    if (!confirm('Are you sure you want to remove this vehicle record?')) return;
    try {
      await deleteVehicle(selectedVehicleId);
      setSelectedVehicleId(null);
      await loadVehicles();
    } catch (err) {
      alert(`Failed to delete vehicle: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
      {/* Left Master List */}
      <div style={{
        width: '380px',
        flexShrink: 0,
        borderRight: '1px solid var(--border-light)',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}>
        <div style={{ padding: '14px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#fafbfc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800 }}>Fleet Directory</h2>
            <button
              onClick={() => {
                setFormData({ model: '', vehicleNo: '', color: '', chassisNo: '' });
                setSelectedCustomer(null);
                setCustomerQuery('');
                setIsNewModalOpen(true);
              }}
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: '12px', gap: '4px' }}
            >
              <Plus size={13} />
              <span>+ Register</span>
            </button>
          </div>

          <div className="input-with-icon" style={{ width: '100%', marginBottom: '8px' }}>
            <Search size={14} className="search-icon-svg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search model, plate, VIN, owner..."
              className="form-input"
              style={{ fontSize: '12px', height: '32px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className={`hub-chip ${filterType === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterType('ALL')}
            >
              All ({vehicles.length})
            </button>
            <button
              className={`hub-chip ${filterType === 'WORKSHOP' ? 'active' : ''}`}
              onClick={() => setFilterType('WORKSHOP')}
            >
              In Workshop ({vehicles.filter(v => v.active_ticket_id).length})
            </button>
            <button
              className={`hub-chip ${filterType === 'READY' ? 'active' : ''}`}
              onClick={() => setFilterType('READY')}
            >
              Ready / Idle
            </button>
          </div>
        </div>

        {/* Vehicle Items List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredVehicles.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>
              No vehicles found matching search.
            </div>
          ) : (
            filteredVehicles.map(veh => {
              const isSelected = veh.id === selectedVehicleId;
              const inWorkshop = Boolean(veh.active_ticket_id);
              return (
                <div
                  key={veh.id}
                  onClick={() => setSelectedVehicleId(veh.id)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    borderLeft: isSelected ? '4px solid var(--honda-red)' : '4px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.15s',
                  }}
                >
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    backgroundColor: inWorkshop ? '#fee2e2' : '#f1f5f9',
                    color: inWorkshop ? 'var(--honda-red)' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Car size={18} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {veh.model || veh.vehicle_name}
                      </span>
                      {inWorkshop && (
                        <span style={{ fontSize: '10px', color: 'var(--honda-red)', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          STAGE {veh.active_stage_id}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: '#f8fafc',
                        padding: '1px 4px',
                        border: '1px solid var(--border-light)',
                        borderRadius: '3px'
                      }}>
                        {veh.vehicle_no || 'NOT REG'}
                      </span>
                      {veh.customer_name && (
                        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          • {veh.customer_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Detail Dossier */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {isDossierLoading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-subtle)' }}>
            Loading vehicle details...
          </div>
        ) : !selectedVehicleDossier ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-subtle)' }}>
            Select a vehicle to view specifications and complete service records.
          </div>
        ) : (
          <>
            {/* Vehicle Specification Card */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--honda-red)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Car size={26} />
                  </div>
                  <div>
                    <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                      {selectedVehicleDossier.model || selectedVehicleDossier.vehicle_name}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '4px',
                        fontWeight: 800,
                        fontSize: '13px',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {selectedVehicleDossier.vehicle_no || 'NOT REGISTERED'}
                      </span>
                      {selectedVehicleDossier.color && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Color: {selectedVehicleDossier.color}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setFormData({
                        model: selectedVehicleDossier.model || '',
                        vehicleNo: selectedVehicleDossier.vehicle_no || '',
                        color: selectedVehicleDossier.color || '',
                        chassisNo: selectedVehicleDossier.chassis_no || '',
                      });
                      setIsEditModalOpen(true);
                    }}
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: '12px', gap: '6px' }}
                  >
                    <Edit2 size={13} />
                    <span>Edit Vehicle</span>
                  </button>
                  <button
                    onClick={handleDeleteVehicle}
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--honda-red)', gap: '6px' }}
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* VIN / Chassis code */}
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-subtle)' }}>Chassis / VIN:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, backgroundColor: '#f8fafc', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                  {selectedVehicleDossier.chassis_no || 'Not recorded'}
                </span>
                {selectedVehicleDossier.chassis_no && (
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedVehicleDossier.chassis_no)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-subtle)' }}
                    title="Copy VIN"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Registered Owner Card */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <User size={16} color="var(--honda-red)" />
                <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Registered Owner</h3>
              </div>

              {selectedVehicleDossier.customer_name ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', marginBottom: '2px' }}>
                      {selectedVehicleDossier.customer_name}
                    </div>
                    {selectedVehicleDossier.customer_phone && (
                      <a href={`tel:${selectedVehicleDossier.customer_phone}`} style={{ fontSize: '13px', color: 'var(--honda-red)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={12} />
                        {selectedVehicleDossier.customer_phone}
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-subtle)', fontSize: '12px' }}>
                  No customer record currently associated with this vehicle.
                </div>
              )}
            </div>

            {/* Service Ticket History */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <FileText size={16} color="var(--honda-red)" />
                <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Service History</h3>
              </div>

              {selectedVehicleDossier.tickets?.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12px' }}>
                  No service tickets recorded for this vehicle.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(selectedVehicleDossier.tickets || []).map(t => (
                    <div
                      key={t.id}
                      onClick={() => onOpenTicket && onOpenTicket(t)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-light)',
                        backgroundColor: '#fafbfc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: onOpenTicket ? 'pointer' : 'default',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => onOpenTicket && (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => onOpenTicket && (e.currentTarget.style.backgroundColor = '#fafbfc')}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--honda-red)', fontFamily: 'var(--font-mono)' }}>
                            {t.ticket_number}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Stage {t.current_stage_id}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                          {t.arrival_date ? new Date(t.arrival_date).toLocaleDateString() : ''}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: t.status === 'CLOSED' ? 'var(--sla-green-bg)' : '#e0e7ff',
                          color: t.status === 'CLOSED' ? 'var(--sla-green-text)' : '#3730a3',
                        }}>
                          {t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Vehicle Modal */}
      {isNewModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Register New Vehicle</h3>
              <button onClick={() => setIsNewModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateVehicle}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Vehicle Model *</label>
                <input
                  type="text"
                  required
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                  className="form-input"
                  placeholder="e.g. Honda City ZX / Activa 6G"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Registration Plate</label>
                <input
                  type="text"
                  value={formData.vehicleNo}
                  onChange={e => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                  className="form-input"
                  placeholder="e.g. KA-01-AB-1234"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label">Color</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    className="form-input"
                    placeholder="e.g. Radiant Red"
                  />
                </div>
                <div>
                  <label className="form-label">Chassis / VIN</label>
                  <input
                    type="text"
                    value={formData.chassisNo}
                    onChange={e => setFormData({ ...formData, chassisNo: e.target.value.toUpperCase() })}
                    className="form-input"
                    placeholder="17-character VIN"
                  />
                </div>
              </div>

              {/* Owner Autocomplete */}
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <label className="form-label">Assign Customer Owner (Optional)</label>
                {selectedCustomer ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{selectedCustomer.name} ({selectedCustomer.primary_phone})</span>
                    <button type="button" onClick={() => setSelectedCustomer(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-subtle)' }}><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={e => setCustomerQuery(e.target.value)}
                      className="form-input"
                      placeholder="Search existing customer by name or phone..."
                    />
                    {customerSuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '4px',
                        boxShadow: 'var(--shadow-md)',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        zIndex: 20,
                      }}>
                        {customerSuggestions.map(c => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setCustomerQuery('');
                              setCustomerSuggestions([]);
                            }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                          >
                            <strong>{c.name}</strong> • {c.primary_phone}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsNewModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Register Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {isEditModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Edit Vehicle Details</h3>
              <button onClick={() => setIsEditModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleUpdateVehicle}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Model Name *</label>
                <input
                  type="text"
                  required
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                  className="form-input"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Registration Number</label>
                <input
                  type="text"
                  value={formData.vehicleNo}
                  onChange={e => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                  className="form-input"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="form-label">Color</label>
                  <input
                    type="text"
                    value={formData.color}
                    onChange={e => setFormData({ ...formData, color: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Chassis / VIN</label>
                  <input
                    type="text"
                    value={formData.chassisNo}
                    onChange={e => setFormData({ ...formData, chassisNo: e.target.value.toUpperCase() })}
                    className="form-input"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
