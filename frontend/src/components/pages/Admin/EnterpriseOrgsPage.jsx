import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbBuilding,
  TbPlus,
  TbX,
  TbChevronRight,
  TbTelescope,
  TbUsers,
} from 'react-icons/tb';
import { enterpriseService } from '../../../services/enterpriseService';

const CreateOrgModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({
    org_name: '',
    admin_full_name: '',
    admin_email: '',
    exploration_limit: 10,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'exploration_limit' ? parseInt(value) || 1 : value,
    }));
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.org_name.trim() || !form.admin_full_name.trim() || !form.admin_email.trim()) {
      setErrorMsg('Org name, admin name, and admin email are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await enterpriseService.createOrg(form);
      if (response.status === 'success') {
        onCreated(response.data);
      } else {
        setErrorMsg(response.message || 'Failed to create organisation.');
      }
    } catch (err) {
      setErrorMsg(err?.message || err?.detail || 'Failed to create organisation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-8 max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <TbX size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <TbBuilding size={22} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Provision Enterprise Org</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Organisation Name <span className="text-red-500">*</span></label>
            <input type="text" name="org_name" value={form.org_name} onChange={handleChange} disabled={isSubmitting} placeholder="Acme Corp" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Admin Full Name <span className="text-red-500">*</span></label>
            <input type="text" name="admin_full_name" value={form.admin_full_name} onChange={handleChange} disabled={isSubmitting} placeholder="Jane Smith" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Admin Email <span className="text-red-500">*</span></label>
            <input type="email" name="admin_email" value={form.admin_email} onChange={handleChange} disabled={isSubmitting} placeholder="jane@acme.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Exploration Quota</label>
            <input type="number" name="exploration_limit" min="1" value={form.exploration_limit} onChange={handleChange} disabled={isSubmitting} className={inputClass} />
          </div>

          {errorMsg && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-2">
              {errorMsg}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all disabled:opacity-60">
              {isSubmitting ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
              ) : (
                <><TbBuilding size={18} /> Create Organisation</>
              )}
            </button>
            <button type="button" onClick={onClose} disabled={isSubmitting}
              className="px-5 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const EnterpriseOrgsPage = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchOrgs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await enterpriseService.listOrgs();
      if (response.status === 'success') {
        setOrgs(response.data || []);
      } else {
        setError(response.message || 'Failed to load organisations.');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load organisations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleOrgCreated = (data) => {
    setShowModal(false);
    fetchOrgs();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
            <TbBuilding className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Enterprise Organisations</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage enterprise accounts and their quotas</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all text-sm">
          <TbPlus size={18} /> New Organisation
        </button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button onClick={fetchOrgs} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm">
            Retry
          </button>
        </div>
      ) : orgs.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-center py-20 bg-white dark:bg-white/5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/10">
          <TbBuilding className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No enterprise organisations yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-6">Click "New Organisation" to provision one.</p>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold mx-auto text-sm hover:bg-blue-700 transition-colors">
            <TbPlus size={18} /> New Organisation
          </button>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {orgs.map((org, i) => (
            <motion.div key={org.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/admin/enterprise/${org.id}`)}
              className="flex items-center gap-4 p-5 bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-200 dark:border-white/10 rounded-2xl cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/40 hover:shadow-lg transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                <TbBuilding size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{org.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <TbTelescope size={12} />
                    {org.exploration_count} / {org.exploration_limit} explorations
                  </span>
                </p>
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 text-right flex-shrink-0">
                <p>Created {new Date(org.created_at).toLocaleDateString()}</p>
              </div>
              <TbChevronRight size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors flex-shrink-0" />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <CreateOrgModal onClose={() => setShowModal(false)} onCreated={handleOrgCreated} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EnterpriseOrgsPage;
