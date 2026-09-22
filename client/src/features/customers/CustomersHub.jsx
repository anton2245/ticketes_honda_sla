import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, UserPlus, Phone, Car, FileText, Building2, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { fetchCustomers, fetchCustomer, createCustomer, updateCustomer, deleteCustomer, addCustomerVehicle } from '../../api/customers.js';

export default function CustomersHub({ onOpenTicket }) {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerDossier, setSelectedCustomerDossier] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, ACTIVE_TICKETS, MULTI_VEHICLE
  const [isLoading, setIsLoading] = useState(false);
  const [isDossierLoading, setIsDossierLoading] = useState(false);

  // Modals
  const [isNewCustModalOpen, setIsNewCustModalOpen] = useState(false);
  const [isEditCustModalOpen, setIsEditCustModalOpen] = useState(false);
  const [isAddVehModalOpen, setIsAddVehModalOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    primaryPhone: '',
    altPhones: '',
    notes: '',
    model: '',
    vehicleNo: '',
    color: '',
    chassisNo: '',
  });

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await fetchCustomers({ q: searchQuery });
      setCustomers(list || []);
      if (!selectedCustomerId && list?.length > 0) {
        setSelectedCustomerId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCustomerId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Load selected customer dossier
  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedCustomerDossier(null);
      return;
    }
    setIsDossierLoading(true);
    fetchCustomer(selectedCustomerId)
      .then(dossier => {
        setSelectedCustomerDossier(dossier);
      })
      .catch(console.error)
      .finally(() => setIsDossierLoading(false));
  }, [selectedCustomerId]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (filterType === 'ACTIVE_TICKETS') {
        return c.vehicles?.some(v => v.active_ticket_id);
      }
      if (filterType === 'MULTI_VEHICLE') {
        return (c.vehicles?.length || 0) > 1;
      }
      return true;
    });
  }, [customers, filterType]);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.primaryPhone) {
      alert('Name and Phone are required');
      return;
    }
    try {
      const res = await createCustomer(formData);
      setIsNewCustModalOpen(false);
      setFormData({ name: '', primaryPhone: '', altPhones: '', notes: '', model: '', vehicleNo: '', color: '', chassisNo: '' });
      await loadCustomers();
      if (res?.id) setSelectedCustomerId(res.id);
    } catch (err) {
      alert(`Failed to create customer: ${err.message}`);
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    try {
      await updateCustomer(selectedCustomerId, {
        name: formData.name,
        primaryPhone: formData.primaryPhone,
        altPhones: formData.altPhones,
        notes: formData.notes,
      });
      setIsEditCustModalOpen(false);
      await loadCustomers();
      const updated = await fetchCustomer(selectedCustomerId);
      setSelectedCustomerDossier(updated);
    } catch (err) {
      alert(`Failed to update customer: ${err.message}`);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomerId) return;
    if (!confirm('Are you sure you want to delete this customer record? Service tickets will be preserved.')) return;
    try {
      await deleteCustomer(selectedCustomerId);
      setSelectedCustomerId(null);
      await loadCustomers();
    } catch (err) {
      alert(`Failed to delete customer: ${err.message}`);
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    try {
      await addCustomerVehicle(selectedCustomerId, {
        model: formData.model,
        vehicleNo: formData.vehicleNo,
        color: formData.color,
        chassisNo: formData.chassisNo,
      });
      setIsAddVehModalOpen(false);
      setFormData({ name: '', primaryPhone: '', altPhones: '', notes: '', model: '', vehicleNo: '', color: '', chassisNo: '' });
      const updated = await fetchCustomer(selectedCustomerId);
      setSelectedCustomerDossier(updated);
    } catch (err) {
      alert(`Failed to add vehicle: ${err.message}`);
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
        {/* Search & Actions Bar */}
        <div style={{ padding: '14px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#fafbfc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800 }}>Customer Directory (CRM)</h2>
            <button
              onClick={() => {
                setFormData({ name: '', primaryPhone: '', altPhones: '', notes: '', model: '', vehicleNo: '', color: '', chassisNo: '' });
                setIsNewCustModalOpen(true);
              }}
              className="btn btn-primary"
              style={{ padding: '4px 10px', fontSize: '12px', gap: '4px' }}
            >
              <UserPlus size={13} />
              <span>+ Register</span>
            </button>
          </div>

          <div className="input-with-icon" style={{ width: '100%', marginBottom: '8px' }}>
            <Search size={14} className="search-icon-svg" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, plate, VIN..."
              className="form-input"
              style={{ fontSize: '12px', height: '32px' }}
            />
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className={`hub-chip ${filterType === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterType('ALL')}
            >
              All ({customers.length})
            </button>
            <button
              className={`hub-chip ${filterType === 'ACTIVE_TICKETS' ? 'active' : ''}`}
              onClick={() => setFilterType('ACTIVE_TICKETS')}
            >
              Active Tickets
            </button>
            <button
              className={`hub-chip ${filterType === 'MULTI_VEHICLE' ? 'active' : ''}`}
              onClick={() => setFilterType('MULTI_VEHICLE')}
            >
              Multi-Vehicle
            </button>
          </div>
        </div>

        {/* Master List Items */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredCustomers.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>
              No customers found matching search.
            </div>
          ) : (
            filteredCustomers.map(cust => {
              const isSelected = cust.id === selectedCustomerId;
              const initials = cust.name ? cust.name.slice(0, 2).toUpperCase() : 'CU';
              const vehCount = cust.vehicles?.length || 0;
              return (
                <div
                  key={cust.id}
                  onClick={() => setSelectedCustomerId(cust.id)}
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
                    borderRadius: '50%',
                    backgroundColor: isSelected ? 'var(--honda-red)' : '#e2e8f0',
                    color: isSelected ? '#ffffff' : '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '13px',
                    flexShrink: 0
                  }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cust.name}
                      </span>
                      {vehCount > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-subtle)', backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '10px' }}>
                          {vehCount} veh
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {cust.primary_phone || 'No phone'}
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
            Loading customer profile...
          </div>
        ) : !selectedCustomerDossier ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-subtle)' }}>
            Select a customer from the left list to view complete profile and service tickets.
          </div>
        ) : (
          <>
            {/* Profile Header Card */}
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
                    borderRadius: '50%',
                    backgroundColor: 'var(--honda-red)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '18px',
                  }}>
                    {selectedCustomerDossier.name ? selectedCustomerDossier.name.slice(0, 2).toUpperCase() : 'CU'}
                  </div>
                  <div>
                    <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                      {selectedCustomerDossier.name}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      <a href={`tel:${selectedCustomerDossier.primary_phone}`} style={{ color: 'var(--honda-red)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        <Phone size={13} />
                        {selectedCustomerDossier.primary_phone}
                      </a>
                      {selectedCustomerDossier.branch_name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Building2 size={13} />
                          <span>{selectedCustomerDossier.branch_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setFormData({
                        name: selectedCustomerDossier.name || '',
                        primaryPhone: selectedCustomerDossier.primary_phone || '',
                        altPhones: selectedCustomerDossier.alt_phones || '',
                        notes: selectedCustomerDossier.notes || '',
                      });
                      setIsEditCustModalOpen(true);
                    }}
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: '12px', gap: '6px' }}
                  >
                    <Edit2 size={13} />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    onClick={handleDeleteCustomer}
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--honda-red)', gap: '6px' }}
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {selectedCustomerDossier.notes && (
                <div style={{ marginTop: '16px', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  <strong>Notes:</strong> {selectedCustomerDossier.notes}
                </div>
              )}
            </div>

            {/* Garage / Linked Vehicles */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Car size={16} color="var(--honda-red)" />
                  <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Customer Garage ({selectedCustomerDossier.vehicles?.length || 0})</h3>
                </div>
                <button
                  onClick={() => {
                    setFormData({ model: '', vehicleNo: '', color: '', chassisNo: '' });
                    setIsAddVehModalOpen(true);
                  }}
                  className="btn btn-outline"
                  style={{ padding: '4px 10px', fontSize: '11px', gap: '4px' }}
                >
                  <Plus size={12} />
                  <span>+ Add Vehicle</span>
                </button>
              </div>

              {selectedCustomerDossier.vehicles?.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12px' }}>
                  No vehicles currently registered under this customer.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                  {selectedCustomerDossier.vehicles.map(v => (
                    <div key={v.id} style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: '#fafbfc'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>{v.model || v.vehicle_name}</span>
                        {v.color && <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>{v.color}</span>}
                      </div>
                      <div style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        backgroundColor: '#ffffff',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '4px',
                        fontWeight: 700,
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '6px'
                      }}>
                        {v.vehicle_no || 'UNREGISTERED'}
                      </div>
                      {v.chassis_no && (
                        <div style={{ fontSize: '11px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                          VIN: {v.chassis_no}
                        </div>
                      )}
                    </div>
                  ))}
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
                <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Service Ticket History ({selectedCustomerDossier.tickets?.length || 0})</h3>
              </div>

              {selectedCustomerDossier.tickets?.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '12px' }}>
                  No service tickets found for this customer.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedCustomerDossier.tickets.map(t => (
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
                          <span style={{ fontWeight: 600, fontSize: '12px' }}>
                            {t.model || t.vehicle_no || 'Vehicle'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                          {t.created_at ? new Date(t.created_at).toLocaleDateString() : ''} • {t.stage_name}
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
                        {t.estimated_cost > 0 && (
                          <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                            ₹{Number(t.estimated_cost).toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Customer Modal */}
      {isNewCustModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewCustModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Register New Customer</h3>
              <button onClick={() => setIsNewCustModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="form-input"
                    placeholder="e.g. Ramesh Kumar"
                  />
                </div>
                <div>
                  <label className="form-label">Primary Phone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.primaryPhone}
                    onChange={e => setFormData({ ...formData, primaryPhone: e.target.value })}
                    className="form-input"
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Alternate Phones / Email</label>
                <input
                  type="text"
                  value={formData.altPhones}
                  onChange={e => setFormData({ ...formData, altPhones: e.target.value })}
                  className="form-input"
                  placeholder="e.g. 9845012345, ramesh@gmail.com"
                />
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginTop: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                  Initial Vehicle (Optional)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                  <div>
                    <label className="form-label">Model</label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={e => setFormData({ ...formData, model: e.target.value })}
                      className="form-input"
                      placeholder="e.g. Activa 6G / City"
                    />
                  </div>
                  <div>
                    <label className="form-label">Registration No</label>
                    <input
                      type="text"
                      value={formData.vehicleNo}
                      onChange={e => setFormData({ ...formData, vehicleNo: e.target.value.toUpperCase() })}
                      className="form-input"
                      placeholder="e.g. KA-01-AB-1234"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button type="button" onClick={() => setIsNewCustModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditCustModalOpen && (
        <div className="modal-overlay" onClick={() => setIsEditCustModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Edit Customer Profile</h3>
              <button onClick={() => setIsEditCustModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleUpdateCustomer}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Primary Phone *</label>
                <input
                  type="tel"
                  required
                  value={formData.primaryPhone}
                  onChange={e => setFormData({ ...formData, primaryPhone: e.target.value })}
                  className="form-input"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Alternate Phones / Email</label>
                <input
                  type="text"
                  value={formData.altPhones}
                  onChange={e => setFormData({ ...formData, altPhones: e.target.value })}
                  className="form-input"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label">Notes & Remarks</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="form-textarea"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsEditCustModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Vehicle to Garage Modal */}
      {isAddVehModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddVehModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Add Vehicle to Garage</h3>
              <button onClick={() => setIsAddVehModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleAddVehicle}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label">Model *</label>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setIsAddVehModalOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
