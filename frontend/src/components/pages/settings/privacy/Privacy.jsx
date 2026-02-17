import React, { useState } from 'react';
import { TbEye, TbDatabase, TbDownload, TbTrash } from 'react-icons/tb';
import GlassCard from '../../../common/GlassCard';
import PremiumToggle from '../../../common/PremiumToggle';
import PremiumButton from '../../../common/PremiumButton';

const Privacy = () => {
  const [visibility, setVisibility] = useState({
    profilePublic: true,
    showOnlineStatus: true,
    searchEngines: false,
  });

  const [dataSharing, setDataSharing] = useState({
    analytics: true,
    personalization: true,
    partners: false,
  });

  const handleVisibilityChange = (key) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDataSharingChange = (key) => {
    setDataSharing(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Privacy Settings
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Control your profile visibility and data usage
          </p>
        </div>
        <PremiumButton>
          Save Changes
        </PremiumButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profile Visibility */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TbEye className="text-blue-500" size={24} />
            Profile Visibility
          </h3>

          <div className="space-y-6">
            <PremiumToggle
              label="Public Profile"
              description="Allow your profile to be visible to other users."
              enabled={visibility.profilePublic}
              onChange={() => handleVisibilityChange('profilePublic')}
            />
            <PremiumToggle
              label="Online Status"
              description="Show when you are currently active."
              enabled={visibility.showOnlineStatus}
              onChange={() => handleVisibilityChange('showOnlineStatus')}
            />
            <PremiumToggle
              label="Search Engines"
              description="Allow search engines to index your profile page."
              enabled={visibility.searchEngines}
              onChange={() => handleVisibilityChange('searchEngines')}
            />
          </div>
        </GlassCard>

        {/* Data Sharing */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TbDatabase className="text-purple-500" size={24} />
            Data & Sharing
          </h3>

          <div className="space-y-6">
            <PremiumToggle
              label="Analytics"
              description="Help us improve by sharing anonymous usage data."
              enabled={dataSharing.analytics}
              onChange={() => handleDataSharingChange('analytics')}
            />
            <PremiumToggle
              label="Personalization"
              description="Use my data to customize my experience."
              enabled={dataSharing.personalization}
              onChange={() => handleDataSharingChange('personalization')}
            />
            <PremiumToggle
              label="Partner Sharing"
              description="Share data with trusted partners for better integration."
              enabled={dataSharing.partners}
              onChange={() => handleDataSharingChange('partners')}
            />
          </div>
        </GlassCard>

        {/* Data Management */}
        <div className="lg:col-span-2">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TbDownload className="text-green-500" size={24} />
              Data Management
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="max-w-2xl">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Export your data</h4>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  Download a copy of your personal data, including your profile information, projects, and settings history. The download will be sent to your email.
                </p>
              </div>
              <PremiumButton variant="secondary" icon={<TbDownload size={18} />}>
                Request Export
              </PremiumButton>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default Privacy;