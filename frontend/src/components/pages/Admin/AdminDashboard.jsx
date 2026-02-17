import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  TbChartBar, TbReload
} from "react-icons/tb";
import { adminService } from "../../../services/adminService";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"];

const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await adminService.getDashboardData();
      if (response.status === "success") {
        setData(response.data);
      } else {
        setError(response.message || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Dashboard error:", err);
      setError(err.message || "An error occurred while fetching dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading dashboard statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          <TbReload size={40} className="cursor-pointer hover:rotate-180 transition-transform duration-500" onClick={fetchDashboardData} />
        </div>
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Mapping API data to Chart formats
  const userGrowthMapped = data.users.map(d => ({
    name: `${monthNames[d.month]} ${d.year}`,
    users: d.count
  }));

  const newUsersMapped = data.new_users.map(d => ({
    name: `${monthNames[d.month]} ${d.year}`,
    newUsers: d.new_users
  }));

  const workspacesMapped = data.workspaces.map(d => ({
    name: `${monthNames[d.month]} ${d.year}`,
    workspaces: d.count
  }));

  const explorationsMapped = data.explorations.map(d => ({
    name: `${monthNames[d.month]} ${d.year}`,
    explorations: d.count
  }));

  const personaDistributionMapped = [
    { name: 'Omi Persona', value: data.persona_distribution.auto_generated },
    { name: 'Manual Persona', value: data.persona_distribution.manual }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Super Admin Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">
            System overview from {data.range.start_date} to {data.range.end_date}
          </p>
        </div>
      </div>

      {/* Graphs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">

        {/* Graph 1: User Growth (Line Chart) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="xl:col-span-2 p-6 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl"
        >
          <h4 className="text-lg font-bold mb-6 text-gray-900 dark:text-white">Total Users</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={userGrowthMapped}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Line
                  name="Total Users"
                  type="monotone"
                  dataKey="users"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graph 2: New Users (Bar Chart) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl"
        >
          <h4 className="text-lg font-bold mb-6 text-gray-900 dark:text-white">Total New Users</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={newUsersMapped}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar name="New Users" dataKey="newUsers" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graph 3: Workspaces (Bar Chart) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="xl:col-span-1 p-6 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl"
        >
          <h4 className="text-lg font-bold mb-6 text-gray-900 dark:text-white">Monthly Workspaces</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={workspacesMapped}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" opacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="workspaces" barSize={20} fill="#10b981" radius={[4, 4, 0, 0]} fillOpacity={0.6} />
                <Line type="monotone" dataKey="workspaces" stroke="#059669" strokeWidth={2} dot={{ r: 4, fill: '#059669' }} tooltipType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graph 4: Total Explorations (Area Chart) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl"
        >
          <h4 className="text-lg font-bold mb-6 text-gray-900 dark:text-white">Total Explorations</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={explorationsMapped}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Area name="Explorations" type="monotone" dataKey="explorations" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graph 5: Persona Type Distribution (Pie Chart) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl"
        >
          <h4 className="text-lg font-bold mb-6 text-gray-900 dark:text-white">Persona Type Distribution</h4>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={personaDistributionMapped}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

      </div>
    </div>
  );
};

export default AdminDashboard;
