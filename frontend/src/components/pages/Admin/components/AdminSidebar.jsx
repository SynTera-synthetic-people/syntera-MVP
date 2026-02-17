import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logout } from "../../../../redux/slices/authSlice";
import {
  TbLayoutDashboard,
  TbUsers,
  TbSettings,
  TbLogout,
  TbChevronRight,
  TbChevronLeft,
  TbShieldCheck
} from "react-icons/tb";
import { useTheme } from "../../../../context/ThemeContext";
import logoForDark from "../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../assets/Logo_Light_bg.png";
import syntheticLogoDark from "../../../../assets/SyntheticLogo_Dark_bg.png";
import syntheticLogoLight from "../../../../assets/SyntheticLogo_Light_bg.png";

const AdminSidebar = ({ isCollapsed, setIsCollapsed }) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleLogout = () => {
    dispatch(logout());
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const menuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: TbLayoutDashboard,
      path: "/admin/dashboard"
    },
    {
      id: "users",
      label: "User Management",
      icon: TbUsers,
      path: "/admin/users"
    }
  ];

  return (
    <div
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
      className={`h-screen fixed top-0 left-0 z-50 flex flex-col transition-all duration-300 ease-in-out border-r border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#0a0e1a]/80 backdrop-blur-xl ${isCollapsed ? "w-20" : "w-64"}`}
    >
      {/* Logo Section */}
      <div className="p-6 flex items-center justify-center flex-shrink-0">
        <div className={`transition-all duration-300 ${isCollapsed ? 'w-10' : 'w-40'}`}>
          <img
            src={isCollapsed ? (theme === 'dark' ? syntheticLogoDark : syntheticLogoLight) : (theme === 'dark' ? logoForDark : logoForLight)}
            alt="Logo"
            className="w-full h-auto object-contain"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-4 space-y-2 overflow-y-auto scrollbar-hide">
        {menuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `
              flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group
              ${isActive
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 font-semibold"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5"
              }
              ${isCollapsed ? "justify-center" : ""}
            `}
          >
            <item.icon size={22} className="flex-shrink-0" />
            {!isCollapsed && <span className="text-sm animate-in fade-in slide-in-from-left-1 duration-200">{item.label}</span>}
            {!isCollapsed && (
              <TbChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Section */}
      <div className="p-4 border-t border-gray-200 dark:border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-200 group"
        >
          <TbLogout size={22} className="flex-shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium animate-in fade-in slide-in-from-left-1 duration-200">Sign Out</span>}
        </button>
      </div>
    </div>
  );
};

export default AdminSidebar;
