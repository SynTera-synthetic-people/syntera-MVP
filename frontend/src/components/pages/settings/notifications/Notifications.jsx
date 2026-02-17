import React, { useState } from 'react';
import { TbBell, TbMail, TbDeviceMobile } from 'react-icons/tb';
import GlassCard from '../../../common/GlassCard';
import PremiumToggle from '../../../common/PremiumToggle';
import PremiumButton from '../../../common/PremiumButton';

const Notifications = () => {
  const [emailNotifications, setEmailNotifications] = useState({
    news: true,
    updates: true,
    marketing: false,
    security: true
  });

  const [pushNotifications, setPushNotifications] = useState({
    comments: true,
    mentions: true,
    reminders: false,
    newDevice: true
  });

  const handleEmailChange = (key) => {
    setEmailNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePushChange = (key) => {
    setPushNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Notifications
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage how you receive notifications and alerts
          </p>
        </div>
        <PremiumButton>
          Save Preferences
        </PremiumButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Email Notifications */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TbMail className="text-blue-500" size={24} />
            Email Notifications
          </h3>

          <div className="space-y-6">
            <PremiumToggle
              label="News & Announcements"
              description="Receive updates about new features and product announcements."
              enabled={emailNotifications.news}
              onChange={() => handleEmailChange('news')}
            />
            <PremiumToggle
              label="Weekly Updates"
              description="Get a weekly summary of your activity and insights."
              enabled={emailNotifications.updates}
              onChange={() => handleEmailChange('updates')}
            />
            <PremiumToggle
              label="Marketing Emails"
              description="Receive offers, surveys, and marketing communications."
              enabled={emailNotifications.marketing}
              onChange={() => handleEmailChange('marketing')}
            />
            <PremiumToggle
              label="Security Alerts"
              description="Get notified about important security events and login attempts."
              enabled={emailNotifications.security}
              onChange={() => handleEmailChange('security')}
            />
          </div>
        </GlassCard>

        {/* Push Notifications */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TbDeviceMobile className="text-purple-500" size={24} />
            Push Notifications
          </h3>

          <div className="space-y-6">
            <PremiumToggle
              label="Comments"
              description="Notify me when someone comments on my projects."
              enabled={pushNotifications.comments}
              onChange={() => handlePushChange('comments')}
            />
            <PremiumToggle
              label="Mentions"
              description="Notify me when I'm mentioned in a discussion."
              enabled={pushNotifications.mentions}
              onChange={() => handlePushChange('mentions')}
            />
            <PremiumToggle
              label="Reminders"
              description="Receive reminders for upcoming billing and events."
              enabled={pushNotifications.reminders}
              onChange={() => handlePushChange('reminders')}
            />
            <PremiumToggle
              label="New Device Sign-in"
              description="Alert me when my account is accessed from a new device."
              enabled={pushNotifications.newDevice}
              onChange={() => handlePushChange('newDevice')}
            />
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Notifications;