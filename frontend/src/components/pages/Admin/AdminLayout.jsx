import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./components/AdminSidebar";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

const MouseParticle = ({ mouseX, mouseY, damping, stiffness, offsetX = 0, offsetY = 0, className }) => {
  const springX = useSpring(mouseX, { stiffness, damping });
  const springY = useSpring(mouseY, { stiffness, damping });

  const x = useTransform(springX, (value) => value + offsetX);
  const y = useTransform(springY, (value) => value + offsetY);

  return (
    <motion.div
      style={{ x, y }}
      className={`fixed top-0 left-0 pointer-events-none ${className}`}
    />
  );
};

const AdminLayout = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="flex min-h-screen relative overflow-hidden bg-gray-50 dark:bg-[#0a0e1a]"
    >
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/10 to-blue-600/5 dark:from-blue-500/20 dark:to-blue-700/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-cyan-300/10 to-blue-500/5 dark:from-blue-400/15 dark:to-cyan-600/10 rounded-full blur-[120px]" />

        <MouseParticle
          mouseX={mouseX} mouseY={mouseY}
          stiffness={150} damping={15} offsetX={-50} offsetY={-50}
          className="w-[100px] h-[100px] bg-blue-400/10 dark:bg-blue-400/10 rounded-full blur-[40px]"
        />
      </div>

      <AdminSidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <main className={`flex-1 relative z-10 overflow-y-auto transition-all duration-300 ${isCollapsed ? "pl-20" : "pl-64"}`}>
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
