
import React, { useState } from 'react';
import { TbUser, TbMail, TbPhone, TbShieldLock, TbTrash } from 'react-icons/tb';
import GlassCard from '../../../common/GlassCard';
import PremiumInput from '../../../common/PremiumInput';
import PremiumButton from '../../../common/PremiumButton';

const Account = () => {
  const [profile, setProfile] = useState({
    fullName: 'Alex Morgan',
    email: 'alex.morgan@synthetic.ai',
    phone: '+1 (555) 123-4567',
    role: 'Administrator',
    bio: 'Lead Researcher leveraging synthetic data for advanced AI modeling.'
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Account Settings
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your personal information and account preferences
          </p>
        </div>
        <PremiumButton>
          Save Changes
        </PremiumButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <GlassCard className="p-6 flex flex-col items-center text-center">
            <div className="relative mb-6 group">
              <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-blue-50 dark:ring-white/5 mx-auto">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              </div>
              <button className="absolute bottom-0 right-0 p-2 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors transform hover:scale-110">
                <TbUser size={18} />
              </button>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{profile.fullName}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{profile.role}</p>
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
                <span className="text-sm font-medium text-green-500 bg-green-500/10 px-2 py-1 rounded-full">Active</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5">
                <span className="text-sm text-gray-500 dark:text-gray-400">Member Since</span>
                <span className="text-sm font-medium">Jan 2024</span>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Personal Information Form */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TbUser className="text-blue-500" size={24} />
              Personal Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Full Name
                </label>
                <PremiumInput
                  name="fullName"
                  value={profile.fullName}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  icon={<TbUser size={20} />}
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <PremiumInput
                  name="email"
                  value={profile.email}
                  onChange={handleInputChange}
                  type="email"
                  placeholder="john@example.com"
                  icon={<TbMail size={20} />}
                />
              </div>

              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <PremiumInput
                  name="phone"
                  value={profile.phone}
                  onChange={handleInputChange}
                  placeholder="+1 (555) 000-0000"
                  icon={<TbPhone size={20} />}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Bio
                </label>
                <textarea
                  name="bio"
                  value={profile.bio}
                  onChange={handleInputChange}
                  rows="4"
                  className="w-full rounded-xl py-3.5 px-4 bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white placeholder-gray-500 border border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 focus:outline-none transition-all resize-none"
                  placeholder="Tell us about yourself..."
                />
              </div>
            </div>
          </GlassCard>

          {/* Danger Zone */}
          <GlassCard className="p-6 border-red-100 dark:border-red-900/30">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
              <TbShieldLock size={24} />
              Danger Zone
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Permanently delete your account and all of your content. This action is not reversible.
            </p>
            <div className="flex justify-end">
              <button className="px-6 py-3.5 rounded-xl font-semibold bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800 flex items-center gap-2">
                <TbTrash size={20} />
                Delete Account
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default Account;