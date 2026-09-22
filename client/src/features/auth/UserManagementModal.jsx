import React, { useState, useEffect } from 'react';
import {
  X, Users, Plus, Search, Shield, Key, Check, UserCheck, UserX, Trash2, Edit2, AlertCircle, CheckCircle2
} from 'lucide-react';
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  toggleUserActive,
  fetchUserPermissions,
  updateUserPermissions
} from '../../api/auth.js';

export default function UserManagementModal({ stages = [], onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Submodal states:
  // editingUser: null (not open), {} (creating new), or userObj (editing existing)
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    id: null,
    username: '',
    displayName: '',
    password: '',
    role: 'user',
    isActive: true,
    permissions: []
  });

  // resetPasswordUser: null or { id, username }
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data || []);
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const showNotice = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Open Create User modal
  const handleOpenCreate = () => {
    const defaultPerms = [];
    for (let i = 1; i <= 13; i++) {
      defaultPerms.push({ stage_id: i, can_read: 1, can_write: 1, can_delete: 0 });
    }

    setUserForm({
      id: null,
      username: '',
      displayName: '',
      password: '',
      role: 'user',
      isActive: true,
      permissions: defaultPerms
    });
    setEditingUser({});
  };

  // Open Edit User modal
  const handleOpenEdit = async (user) => {
    let perms = [];
    try {
      perms = await fetchUserPermissions(user.id);
    } catch {
      // fallback
      for (let i = 1; i <= 13; i++) {
        perms.push({ stage_id: i, can_read: 1, can_write: 1, can_delete: 0 });
      }
    }

    setUserForm({
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      password: '', // optional on edit
      role: user.role || 'user',
      isActive: user.is_active === 1,
      permissions: perms || []
    });
    setEditingUser(user);
  };

  // Toggle user active / inactive
  const handleToggleActive = async (user) => {
    const newStatus = user.is_active === 1 ? 0 : 1;
    try {
      await toggleUserActive(user.id, newStatus);
      showNotice(`User ${user.username} ${newStatus ? 'activated' : 'deactivated'}.`);
      loadUsers();
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Delete user
  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${user.username}"?`)) {
      return;
    }
    try {
      await deleteUser(user.id);
      showNotice(`User ${user.username} deleted.`);
      loadUsers();
    } catch (err) {
      showNotice(err.message, 'error');
    }
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.username.trim()) {
      showNotice('Username is required.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (userForm.id) {
        // Update user details
        await updateUser(userForm.id, {
          displayName: userForm.displayName,
          role: userForm.role,
          isActive: userForm.isActive ? 1 : 0
        });

        // Update permissions if non-admin
        if (userForm.role !== 'admin') {
          await updateUserPermissions(userForm.id, userForm.permissions);
        }

        // If password was entered, update password
        if (userForm.password) {
          await resetUserPassword(userForm.id, userForm.password);
        }

        showNotice(`User "${userForm.username}" updated successfully.`);
      } else {
        // Create user
        if (!userForm.password) {
          showNotice('Password is required for new users.', 'error');
          setIsSubmitting(false);
          return;
        }

        await createUser({
          username: userForm.username.trim().toLowerCase(),
          password: userForm.password,
          displayName: userForm.displayName,
          role: userForm.role,
          isActive: userForm.isActive ? 1 : 0,
          permissions: userForm.permissions
        });

        showNotice(`User "${userForm.username}" created successfully.`);
      }

      setEditingUser(null);
      loadUsers();
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Reset Password
  const handleSaveResetPassword = async (e) => {
    e.preventDefault();
    if (!newPasswordVal) {
      showNotice('New password is required.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetUserPassword(resetPasswordTarget.id, newPasswordVal);
      showNotice(`Password reset for @${resetPasswordTarget.username}.`);
      setResetPasswordTarget(null);
      setNewPasswordVal('');
    } catch (err) {
      showNotice(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Permission Presets helper
  const applyPreset = (preset) => {
    const updated = [];
    for (let i = 1; i <= 13; i++) {
      if (preset === 'full') {
        updated.push({ stage_id: i, can_read: 1, can_write: 1, can_delete: 1 });
      } else if (preset === 'readonly') {
        updated.push({ stage_id: i, can_read: 1, can_write: 0, can_delete: 0 });
      } else if (preset === 'floor') {
        if (i >= 6 && i <= 9) {
          updated.push({ stage_id: i, can_read: 1, can_write: 1, can_delete: 1 });
        } else {
          updated.push({ stage_id: i, can_read: 1, can_write: 0, can_delete: 0 });
        }
      } else if (preset === 'clear') {
        updated.push({ stage_id: i, can_read: 0, can_write: 0, can_delete: 0 });
      }
    }
    setUserForm(prev => ({ ...prev, permissions: updated }));
  };

  const handlePermChange = (stageId, permKey, value) => {
    setUserForm(prev => {
      const perms = [...prev.permissions];
      const idx = perms.findIndex(p => p.stage_id === stageId);
      if (idx >= 0) {
        perms[idx] = { ...perms[idx], [permKey]: value ? 1 : 0 };
      } else {
        perms.push({
          stage_id: stageId,
          can_read: permKey === 'can_read' ? (value ? 1 : 0) : 0,
          can_write: permKey === 'can_write' ? (value ? 1 : 0) : 0,
          can_delete: permKey === 'can_delete' ? (value ? 1 : 0) : 0,
        });
      }
      return { ...prev, permissions: perms };
    });
  };

  // Filter users by search
  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9990,
      padding: '20px'
    }}>
      <div style={{
        width: '900px',
        maxWidth: '100%',
        maxHeight: '90vh',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modalIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Users size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                User Management & Access Control
              </h3>
              <div style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>
                Manage team members, roles, and granular 13-stage permissions
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon"
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }}>
            <Search size={14} color="var(--text-subtle)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user name or role..."
              className="form-input"
              style={{ paddingLeft: '32px', height: '32px', fontSize: '12.5px', width: '100%' }}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreate}
            style={{ padding: '6px 14px', fontSize: '12.5px', gap: '6px' }}
          >
            <Plus size={15} />
            <span>Add New User</span>
          </button>
        </div>

        {/* Notification Alert Banner */}
        {notification && (
          <div style={{
            margin: '12px 20px 0 20px',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '12.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: notification.type === 'error' ? '#b91c1c' : '#047857',
            border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`
          }}>
            {notification.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            <span>{notification.msg}</span>
          </div>
        )}

        {/* Users Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-subtle)', fontSize: '13px' }}>
              No users match your search.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-subtle)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '8px 12px' }}>User</th>
                  <th style={{ padding: '8px 12px' }}>Role</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Permissions</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const displayName = u.display_name || u.username;
                  const isAdmin = u.role === 'admin';
                  const isActive = u.is_active === 1;
                  const perms = u.permissions || [];
                  const readCount = perms.filter(p => p.can_read).length;
                  const writeCount = perms.filter(p => p.can_write).length;
                  const deleteCount = perms.filter(p => p.can_delete).length;

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: isAdmin ? '#fee2e2' : '#f1f5f9',
                            color: isAdmin ? '#dc2626' : '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '13px'
                          }}>
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{displayName}</div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isAdmin ? '#eff6ff' : '#f8fafc',
                          color: isAdmin ? '#1d4ed8' : '#64748b',
                          border: `1px solid ${isAdmin ? '#bfdbfe' : '#e2e8f0'}`
                        }}>
                          {isAdmin ? 'ADMIN' : 'USER'}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: isActive ? '#ecfdf5' : '#fef2f2',
                          color: isActive ? '#047857' : '#b91c1c',
                          border: `1px solid ${isActive ? '#a7f3d0' : '#fecaca'}`
                        }}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        {isAdmin ? (
                          <span style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: 600 }}>
                            Full Access (13 Stages)
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            R:{readCount} W:{writeCount} D:{deleteCount}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleOpenEdit(u)}
                            title="Edit User & Permissions"
                            style={{ padding: '3px 8px', fontSize: '11.5px', gap: '4px' }}
                          >
                            <Edit2 size={12} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => {
                              setResetPasswordTarget({ id: u.id, username: u.username });
                              setNewPasswordVal('');
                            }}
                            title="Reset User Password"
                            style={{ padding: '3px 8px', fontSize: '11.5px', gap: '4px' }}
                          >
                            <Key size={12} />
                            <span>Reset</span>
                          </button>

                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleToggleActive(u)}
                            title={isActive ? 'Deactivate User' : 'Activate User'}
                            style={{ padding: '3px 8px', fontSize: '11.5px', color: isActive ? '#b45309' : '#047857' }}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>

                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => handleDeleteUser(u)}
                            title="Delete User"
                            style={{ padding: '3px 8px', fontSize: '11.5px', color: '#dc2626' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>
            Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            style={{ padding: '5px 14px', fontSize: '12.5px' }}
          >
            Close
          </button>
        </div>
      </div>

      {/* SUB-MODAL 1: ADD / EDIT USER FORM WITH PERMISSION MATRIX */}
      {editingUser !== null && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            width: '680px',
            maxWidth: '100%',
            maxHeight: '92vh',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Submodal Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                {userForm.id ? `Edit User: @${userForm.username}` : 'Add New User'}
              </h4>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Submodal Body */}
            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
                {/* Form Fields Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  {/* Username */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                      Username {!userForm.id && <span style={{ color: 'var(--honda-red)' }}>*</span>}
                    </label>
                    <input
                      type="text"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="e.g. jdoe"
                      disabled={!!userForm.id}
                      required
                      className="form-input"
                      style={{ width: '100%', height: '34px', fontSize: '12.5px' }}
                    />
                    {userForm.id && (
                      <small style={{ fontSize: '10.5px', color: 'var(--text-subtle)' }}>Username cannot be changed</small>
                    )}
                  </div>

                  {/* Display Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={userForm.displayName}
                      onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="form-input"
                      style={{ width: '100%', height: '34px', fontSize: '12.5px' }}
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                      {userForm.id ? 'New Password' : 'Password'} {!userForm.id && <span style={{ color: 'var(--honda-red)' }}>*</span>}
                    </label>
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      placeholder={userForm.id ? 'Leave blank to keep current' : 'Enter initial password'}
                      required={!userForm.id}
                      className="form-input"
                      style={{ width: '100%', height: '34px', fontSize: '12.5px' }}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                      Role
                    </label>
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      className="form-select"
                      style={{ width: '100%', height: '34px', fontSize: '12.5px' }}
                    >
                      <option value="user">Standard User</option>
                      <option value="admin">Administrator (Full Access)</option>
                    </select>
                  </div>
                </div>

                {/* Active Checkbox */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={userForm.isActive}
                      onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                    />
                    <span>Account Active (Allowed to sign in)</span>
                  </label>
                </div>

                {/* 13-Stage Permissions Matrix */}
                <div style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '14px',
                  backgroundColor: '#f8fafc'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Stage Access Permissions</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>Control which stages this user can read, modify, or advance</div>
                    </div>

                    {userForm.role !== 'admin' && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" onClick={() => applyPreset('full')} className="btn btn-outline" style={{ padding: '2px 6px', fontSize: '10.5px' }}>Full</button>
                        <button type="button" onClick={() => applyPreset('readonly')} className="btn btn-outline" style={{ padding: '2px 6px', fontSize: '10.5px' }}>Read-Only</button>
                        <button type="button" onClick={() => applyPreset('floor')} className="btn btn-outline" style={{ padding: '2px 6px', fontSize: '10.5px' }}>Workshop (6-9)</button>
                        <button type="button" onClick={() => applyPreset('clear')} className="btn btn-outline" style={{ padding: '2px 6px', fontSize: '10.5px' }}>Clear</button>
                      </div>
                    )}
                  </div>

                  {userForm.role === 'admin' ? (
                    <div style={{
                      padding: '10px 14px',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                      color: '#1d4ed8',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <Shield size={16} />
                      <span>Administrator role automatically grants full read, write, and delete permissions to all 13 stages.</span>
                    </div>
                  ) : (
                    <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '6px', backgroundColor: '#ffffff' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--border-light)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 10px' }}>Stage</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center' }}>Read</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center' }}>Write</th>
                            <th style={{ padding: '6px 10px', textAlign: 'center' }}>Delete</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 13 }, (_, i) => i + 1).map(stageId => {
                            const stageDef = stages.find(s => s.id === stageId);
                            const stageName = stageDef ? stageDef.name : `Stage ${stageId}`;
                            const p = userForm.permissions.find(x => x.stage_id === stageId) || {};

                            return (
                              <tr key={stageId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--honda-red)', marginRight: '6px' }}>#{stageId}</span>
                                  <span>{stageName}</span>
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!p.can_read}
                                    onChange={(e) => handlePermChange(stageId, 'can_read', e.target.checked)}
                                  />
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!p.can_write}
                                    onChange={(e) => handlePermChange(stageId, 'can_write', e.target.checked)}
                                  />
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!p.can_delete}
                                    onChange={(e) => handlePermChange(stageId, 'can_delete', e.target.checked)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Submodal Actions */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                backgroundColor: '#f8fafc'
              }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingUser(null)}
                  disabled={isSubmitting}
                  style={{ padding: '6px 14px', fontSize: '12.5px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{ padding: '6px 16px', fontSize: '12.5px' }}
                >
                  {isSubmitting ? 'Saving...' : 'Save User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL 2: RESET PASSWORD */}
      {resetPasswordTarget !== null && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            width: '380px',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}>
              <h4 style={{ fontSize: '14.5px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Reset Password for @{resetPasswordTarget.username}
              </h4>
              <button
                type="button"
                onClick={() => setResetPasswordTarget(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveResetPassword} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '5px' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                  placeholder="Enter new password"
                  required
                  autoFocus
                  className="form-input"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setResetPasswordTarget(null)}
                  disabled={isSubmitting}
                  style={{ padding: '5px 12px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{ padding: '5px 14px', fontSize: '12px' }}
                >
                  {isSubmitting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
