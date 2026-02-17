import React, { useState } from 'react';
import { TbCreditCard, TbCalendar, TbDownload, TbPlus } from 'react-icons/tb';
import GlassCard from '../../../common/GlassCard';
import PremiumInput from '../../../common/PremiumInput';
import PremiumButton from '../../../common/PremiumButton';

const Billing = () => {
  const [cardDetails, setCardDetails] = useState({
    holderName: '',
    cardNumber: '',
    expiryDate: '',
    cvv: ''
  });

  const billingHistory = [
    { id: 1, date: 'Oct 01, 2025', invoice: '#INV-2025-001', amount: '$49.00', status: 'Paid' },
    { id: 2, date: 'Sep 01, 2025', invoice: '#INV-2025-002', amount: '$49.00', status: 'Paid' },
    { id: 3, date: 'Aug 01, 2025', invoice: '#INV-2025-003', amount: '$49.00', status: 'Paid' },
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCardDetails(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Billing & Payment
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your payment methods and view billing history
          </p>
        </div>
        <PremiumButton variant="secondary" size="sm" icon={<TbPlus size={18} />}>
          Add Payment Method
        </PremiumButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Payment Method Section */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TbCreditCard className="text-blue-500" size={24} />
              Payment Method
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Card Holder Name
                </label>
                <PremiumInput
                  name="holderName"
                  value={cardDetails.holderName}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Card Number
                </label>
                <PremiumInput
                  name="cardNumber"
                  value={cardDetails.cardNumber}
                  onChange={handleInputChange}
                  placeholder="**** **** **** ****"
                  icon={<TbCreditCard size={20} />}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Expiry Date
                </label>
                <PremiumInput
                  name="expiryDate"
                  value={cardDetails.expiryDate}
                  onChange={handleInputChange}
                  placeholder="MM/YY"
                  icon={<TbCalendar size={20} />}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  CVV
                </label>
                <PremiumInput
                  type="password"
                  name="cvv"
                  value={cardDetails.cvv}
                  onChange={handleInputChange}
                  placeholder="***"
                  showPasswordToggle={false}
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <PremiumButton>
                Update Card
              </PremiumButton>
            </div>
          </GlassCard>
        </div>

        {/* Current Plan Summary (Optional Side Panel) */}
        <div className="lg:col-span-1">
          <GlassCard className="p-6 h-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/5 dark:to-purple-500/5 border-blue-100 dark:border-blue-500/20">
            <h3 className="text-lg font-semibold mb-4">Current Plan</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Plan</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">Pro</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Billing Cycle</span>
                <span className="font-medium">Monthly</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Next Billing</span>
                <span className="font-medium">Nov 01, 2025</span>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-white/10">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span>$49.00</span>
                </div>
              </div>
              <PremiumButton variant="secondary" className="w-full mt-4">
                Change Plan
              </PremiumButton>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Billing History Section */}
      <GlassCard className="p-6 mt-8">
        <h3 className="text-lg font-semibold mb-6">Billing History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-white/10">
                <th className="pb-4 font-medium text-gray-500 dark:text-gray-400">Invoice</th>
                <th className="pb-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                <th className="pb-4 font-medium text-gray-500 dark:text-gray-400">Amount</th>
                <th className="pb-4 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="pb-4 font-medium text-gray-500 dark:text-gray-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {billingHistory.map((item) => (
                <tr key={item.id} className="group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <td className="py-4 font-medium">{item.invoice}</td>
                  <td className="py-4 text-gray-600 dark:text-gray-300">{item.date}</td>
                  <td className="py-4 text-gray-600 dark:text-gray-300">{item.amount}</td>
                  <td className="py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400">
                      {item.status}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <button className="text-gray-400 hover:text-blue-500 transition-colors p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10">
                      <TbDownload size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
};

export default Billing;