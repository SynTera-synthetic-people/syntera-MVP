import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TbArrowRight, TbPlus, TbLayoutDashboard, TbSun, TbMoon } from 'react-icons/tb';
import { useSelector } from 'react-redux';
import { useTheme } from "../../../context/ThemeContext";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { workspaceService } from "../../../services/workspaceService";
import WorkspacePopup from "../organization/Workspace/WorkspacePopup";
import { useWorkspace as useWorkspaceContext } from "../../../context/WorkspaceContext";

const LandingPage = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user } = useSelector((state) => state.auth);
  const [hasWorkspaces, setHasWorkspaces] = useState(false);
  const [loading, setLoading] = useState(true);
  const { setSelectedWorkspace } = useWorkspaceContext();
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    const isSuperAdmin =
      user?.user_type === "Super Admin" ||
      user?.user_type === "super_admin" ||
      user?.role === "Super Admin" ||
      user?.role === "super_admin";

    if (isSuperAdmin) {
      navigate("/admin/dashboard");
    }
  }, [user, navigate]);

  const fetchWorkspaces = async () => {
    try {
      const response = await workspaceService.getAll();
      const workspaceData = response?.data || [];
      setWorkspaces(workspaceData);
      setHasWorkspaces(workspaceData.length > 0);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      setHasWorkspaces(false);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const handleCreateWorkspace = () => {
    setShowWorkspaceModal(true);
  };

  const handleViewWorkspace = () => {
    if (workspaces.length > 0) {
      const sortedWorkspaces = [...workspaces].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );
      setSelectedWorkspace(sortedWorkspaces[0]);
      navigate(`/main/organization/workspace/explorations/${sortedWorkspaces[0].id}`);
    } else {
      navigate('/main/organization/workspace');
    }
  };

  const handleWorkspaceCreated = (newWorkspace) => {
    setShowWorkspaceModal(false);
    if (newWorkspace?.id) {
      setSelectedWorkspace(newWorkspace);
      navigate(`/main/organization/workspace/explorations/${newWorkspace.id}`);
    } else {
      fetchWorkspaces();
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden bg-gray-50 dark:bg-[#0f1115] transition-colors duration-300">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-primary/10 dark:bg-blue-primary/40 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-primary-light/10 dark:bg-blue-primary-light/30 rounded-full blur-[100px] animate-pulse delay-700" />
        <div className="absolute top-[40%] right-[20%] w-[40%] h-[40%] bg-blue-500/5 dark:bg-blue-500/20 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-full bg-white/10 backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-lg text-gray-600 dark:text-yellow-400 hover:scale-110 transition-transform z-50"
      >
        {theme === 'dark' ? <TbSun size={24} /> : <TbMoon size={24} className="text-gray-700" />}
      </button>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl w-full text-center space-y-8 z-10 px-4"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex justify-center"
        >
          <img src={theme === 'dark' ? logoForDark : logoForLight} alt="Logo" className="h-16 w-auto object-contain" />
        </motion.div>

        {/* Header Section */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-900 to-blue-600 dark:from-white dark:to-blue-primary-lighter">
            Welcome to Synthetic-People
          </h1>

          <p className="text-xl md:text-2xl font-light italic text-gray-700 dark:text-gray-300">
            Your users. Ready to talk
          </p>

          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Synthetic-People bring digital twins of your users to life. With real emotions, biases, and behavioural quirks.
          </p>
        </div>

        {/* Call to Action Section */}
        <div className="space-y-4">
          <p className="text-xl font-medium text-gray-800 dark:text-gray-200">
            Pick your people. Ask your questions. Get instant insights.
          </p>

          <div className="inline-flex items-center gap-2">
            Lets go!
          </div>
        </div>

        {/* Commented Yellow Placeholder Box */}
        {/* <div className="grid md:grid-cols-2 gap-8 items-center mt-8 max-w-3xl mx-auto">
                    <motion.div 
                        whileHover={{ scale: 1.02, rotate: 0 }}
                        className="bg-gradient-to-br from-yellow-300 to-yellow-500 text-black p-6 rounded-2xl font-bold text-base flex items-center justify-center min-h-[120px] shadow-xl shadow-yellow-500/20 transform -rotate-1 transition-all duration-300"
                    >
                        Omi First Appearance & Greeting Motion
                    </motion.div>
                </div> */}

        {/* Conditional Workspace Button */}
        <div className="flex justify-center mt-8">
          {loading ? (
            <div className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-blue-500 rounded-full animate-spin" />
              <span>Loading...</span>
            </div>
          ) : hasWorkspaces ? (
            <button
              onClick={handleViewWorkspace}
              className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 font-semibold"
            >
              <TbLayoutDashboard className="w-5 h-5" />
              <span>View Workspace</span>
              <TbArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleCreateWorkspace}
              className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 font-semibold"
            >
              <TbPlus className="w-5 h-5" />
              <span>Create Workspace</span>
              <TbArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Workspace Creation Modal */}
      <WorkspacePopup
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
        onSuccess={handleWorkspaceCreated}
      />
    </div>
  );
};

export default LandingPage;
