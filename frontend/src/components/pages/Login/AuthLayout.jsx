import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../../context/ThemeContext';
import LogoLight from '../../../assets/Logo_Light_bg.png';
import LogoDark from '../../../assets/Logo_Dark_bg.png';

const AuthLayout = ({ children, title }) => {
  const { theme } = useTheme();

  const cardVariants = {
    hidden: { opacity: 0, y: 50, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1, 
      transition: { 
        duration: 0.5, 
        ease: [0.25, 1, 0.5, 1] 
      } 
    },
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-8 space-y-6"      
        variants={cardVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="text-center space-y-4">
          <img 
            src={theme === 'dark' ? LogoDark : LogoLight} 
            alt="Company Logo" 
            className="mx-auto h-16 w-auto"
          />
          <h1 className="text-2xl text-neutral-900 dark:text-neutral-100">{title}</h1>
        </div>
        {children}
      </motion.div>
    </div>
  );
};

export default AuthLayout;
