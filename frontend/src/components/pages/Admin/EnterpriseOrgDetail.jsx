import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbArrowLeft,
  TbBuilding,
  TbUsers,
  TbTelescope,
  TbUserPlus,
  TbTrash,
  TbEdit,
  TbCheck,
  TbX,
} from 'react-icons/tb';
import { enterpriseService } from '../../../services/enterpriseService';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Badge = ({ children, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800',
    gray: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10',
    amber: 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${colors[color]}`}>
      {children}
    </span>
  );
};

const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
      active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
    }`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Add Member Modal
// ---------------------------------------------------------------------------

const AddMemberModal = ({ orgId, onClose, onAdded }) => {
  const [form, setForm] = useState({ full_name: '', email: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      setErrorMsg('Full name and email are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await enterpriseService.addMember(orgId, form);
      if (response.status === 'success') {
        onAdded(response.data);
      } else {
        setErrorMsg(response.message || 'Failed to add member.');
      }
    } catch (err) {
      setErrorMsg(err?.message || err?.detail || 'Failed to add member.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-8"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <TbX size={20} />
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <TbUserPlus size={20} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Member</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Full Name <span className="text-red-500">*</span></label>
            <input type="text" name="full_name" value={form.full_name} onChange={handleChange} disabled={isSubmitting} placeholder="Jane Smith" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email <span className="text-red-500">*</span></label>
            <input type="email" name="email" value={form.email} onChange={handleChange} disabled={isSubmitting} placeholder="jane@acme.com" className={inputClass} />
          </div>
          {errorMsg && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-2">
              {errorMsg}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all disabled:opacity-60 text-sm">
              {isSubmitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <TbUserPlus size={16} />}
              {isSubmitting ? 'Adding...' : 'Add Member'}
            </button>
            <button type="button" onClick={onClose} disabled={isSubmitting}
              className="px-5 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-sm disabled:opacity-50">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const EnterpriseOrgDetail = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();

  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [explorations, setExplorations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('members');

  // Limit editing
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [limitValue, setLimitValue] = useState('');
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);

  // Remove member
  const [removingUserId, setRemovingUserId] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, membersRes, explorationsRes] = await Promise.all([
        enterpriseService.getOrg(orgId),
        enterpriseService.listMembers(orgId),
        enterpriseService.listExplorations(orgId),
      ]);
      if (orgRes.status === 'success') setOrg(orgRes.data);
      if (membersRes.status === 'success') setMembers(membersRes.data || []);
      if (explorationsRes.status === 'success') setExplorations(explorationsRes.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load organisation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [orgId]);

  const handleSaveLimit = async () => {
    const newLimit = parseInt(limitValue);
    if (!newLimit || newLimit < 1) return;
    setIsSavingLimit(true);
    try {
      const response = await enterpriseService.updateOrgLimit(orgId, newLimit);
      if (response.status === 'success') {
        setOrg((prev) => ({ ...prev, exploration_limit: response.data.exploration_limit }));
        setIsEditingLimit(false);
      }
    } catch (err) {
      alert(err?.message || 'Failed to update limit.');
    } finally {
      setIsSavingLimit(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member from the organisation? They will revert to a free account.')) return;
    setRemovingUserId(userId);
    try {
      await enterpriseService.removeMember(orgId, userId);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err) {
      alert(err?.message || 'Failed to remove member.');
    } finally {
      setRemovingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Organisation not found.'}</p>
        <button onClick={() => navigate('/admin/enterprise')}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm">
          Back to Organisations
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8 flex-wrap">
        <button onClick={() => navigate('/admin/enterprise')}
          className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors">
          <TbArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <TbBuilding size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{org.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Enterprise Organisation</p>
        </div>
      </motion.div>

      {/* Stats card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Members', value: members.length, icon: TbUsers },
          {
            label: 'Explorations Used',
            value: `${org.exploration_count} / ${org.exploration_limit}`,
            icon: TbTelescope,
          },
          { label: 'Created', value: new Date(org.created_at).toLocaleDateString(), icon: TbBuilding },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label}
            className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-center">
            <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* Quota editor */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-5 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Exploration Quota</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Adjust how many explorations this org can run</p>
        </div>
        {isEditingLimit ? (
          <div className="flex items-center gap-2">
            <input
              type="number" min="1" value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              disabled={isSavingLimit}
              className="w-24 px-3 py-2 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:border-blue-500 outline-none disabled:opacity-50"
            />
            <button onClick={handleSaveLimit} disabled={isSavingLimit}
              className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
              {isSavingLimit ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" /> : <TbCheck size={16} />}
            </button>
            <button onClick={() => setIsEditingLimit(false)} disabled={isSavingLimit}
              className="p-2 rounded-xl border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <TbX size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-900 dark:text-white">{org.exploration_limit}</span>
            <button onClick={() => { setLimitValue(String(org.exploration_limit)); setIsEditingLimit(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
              <TbEdit size={14} /> Edit Quota
            </button>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5">
        <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')}>
          Members ({members.length})
        </TabButton>
        <TabButton active={activeTab === 'explorations'} onClick={() => setActiveTab('explorations')}>
          Explorations ({explorations.length})
        </TabButton>
      </div>

      {/* Members tab */}
      {activeTab === 'members' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAddMember(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all">
              <TbUserPlus size={16} /> Add Member
            </button>
          </div>
          {members.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-white/5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/10">
              <TbUsers className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No members yet. Add the first one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id}
                  className="flex items-center gap-4 p-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
                  <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 font-semibold text-sm">
                    {member.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{member.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge color={member.is_active ? 'green' : 'gray'}>
                      {member.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge color="blue">{member.role}</Badge>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {member.exploration_count} explorations
                    </span>
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={removingUserId === member.id}
                      className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {removingUserId === member.id
                        ? <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin block" />
                        : <TbTrash size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Explorations tab */}
      {activeTab === 'explorations' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {explorations.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-white/5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/10">
              <TbTelescope className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No explorations yet across this organisation.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {explorations.map((exp) => (
                <div key={exp.id}
                  className="flex items-start gap-4 p-4 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
                  <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                    <TbTelescope size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{exp.title}</p>
                    {exp.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{exp.description}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Workspace: {exp.workspace_id} | {exp.created_at ? new Date(exp.created_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {exp.is_quantitative && <Badge color="blue">Quant</Badge>}
                    {exp.is_qualitative && <Badge color="green">Qual</Badge>}
                    {exp.is_end && <Badge color="gray">Ended</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {showAddMember && (
          <AddMemberModal
            orgId={orgId}
            onClose={() => setShowAddMember(false)}
            onAdded={(newMember) => {
              setMembers((prev) => [...prev, newMember]);
              setShowAddMember(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EnterpriseOrgDetail;
