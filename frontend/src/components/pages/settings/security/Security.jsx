import React, { useState } from 'react';
import { TbLock, TbShieldCheck, TbDeviceDesktop, TbDeviceMobile, TbHistory } from 'react-icons/tb';
import GlassCard from '../../../common/GlassCard';
import PremiumInput from '../../../common/PremiumInput';
import PremiumButton from '../../../common/PremiumButton';
import PremiumToggle from '../../../common/PremiumToggle';

const Security = () => {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const loginSessions = [
    { id: 1, device: 'Chrome on Windows', location: 'New York, USA', time: 'Current Session', icon: <TbDeviceDesktop size={20} />, active: true },
    { id: 2, device: 'Safari on iPhone 13', location: 'New York, USA', time: '2 hours ago', icon: <TbDeviceMobile size={20} />, active: false },
    { id: 3, device: 'Firefox on MacOS', location: 'London, UK', time: '3 days ago', icon: <TbDeviceDesktop size={20} />, active: false },
  ];

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Security
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Update your password and manage account security
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Change Password */}
        <div className="lg:col-span-2 space-y-8">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TbLock className="text-blue-500" size={24} />
              Change Password
            </h3>

            <div className="grid grid-cols-1 gap-6 max-w-xl">
              <PremiumInput
                type="password"
                name="currentPassword"
                label="Current Password"
                placeholder="Enter current password"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
              />
              <PremiumInput
                type="password"
                name="newPassword"
                label="New Password"
                placeholder="Enter new password"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
              />
              <PremiumInput
                type="password"
                name="confirmPassword"
                label="Confirm New Password"
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
              />
              <div className="flex justify-end pt-2">
                <PremiumButton>Update Password</PremiumButton>
              </div>
            </div>
          </GlassCard>

          {/* Two-Factor Authentication */}
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TbShieldCheck className="text-green-500" size={24} />
              Two-Factor Authentication
            </h3>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Add an extra layer of security to your account by enabling two-factor authentication (2FA).
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  We'll ask for a code from your authenticator app when you login.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <PremiumToggle
                  enabled={twoFactorEnabled}
                  onChange={setTwoFactorEnabled}
                  label={twoFactorEnabled ? "Enabled" : "Disabled"}
                />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Login Sessions */}
        <div className="lg:col-span-1">
          <GlassCard className="p-6 h-full">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TbHistory className="text-orange-500" size={24} />
              Login Sessions
            </h3>

            <div className="space-y-6">
              {loginSessions.map((session) => (
                <div key={session.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <div className={`p-2 rounded-lg ${session.active ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                    {session.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {session.device}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {session.location} • {session.time}
                    </p>
                  </div>
                  {session.active && (
                    <div className="h-2 w-2 rounded-full bg-green-500 mt-2" title="Active Now"></div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/10">
              <button className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors w-full text-center">
                Sign out of all other sessions
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default Security;