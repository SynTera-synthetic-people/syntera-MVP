import React from "react";
import { motion } from "framer-motion";

/**
 * PremiumButton - Reusable button component with premium styling
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Button content
 * @param {string} props.variant - Button style: 'primary' | 'secondary' | 'ghost' | 'icon'
 * @param {string} props.size - Button size: 'sm' | 'md' | 'lg'
 * @param {boolean} props.loading - Show loading state
 * @param {boolean} props.disabled - Disable button
 * @param {React.ReactNode} props.icon - Icon element
 * @param {string} props.iconPosition - Icon position: 'left' | 'right'
 * @param {Function} props.onClick - Click handler
 * @param {string} props.className - Additional CSS classes
 */
const PremiumButton = ({ 
  children, 
  variant = "primary", 
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconPosition = "left",
  onClick,
  className = "",
  type = "button",
  ...props 
}) => {
  const baseClasses = "font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2";
  
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3.5 text-base",
    lg: "px-8 py-4 text-lg"
  };

  const variants = {
    primary: "bg-gradient-to-r from-blue-primary via-blue-primary-dark to-blue-primary bg-[length:200%_auto] hover:bg-right text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-primary/40",
    secondary: "bg-white dark:bg-white/5 border-2 border-blue-primary dark:border-blue-primary-light text-blue-primary dark:text-blue-primary-light hover:bg-blue-50 dark:hover:bg-white/10",
    ghost: "bg-transparent hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300",
    icon: "p-3 bg-white/10 backdrop-blur-md border border-gray-200 dark:border-white/10 hover:bg-white/20 dark:hover:bg-white/20 text-gray-700 dark:text-white"
  };

  const disabledClasses = "bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-70";

  const buttonClasses = `${baseClasses} ${sizes[size]} ${disabled || loading ? disabledClasses : variants[variant]} ${className}`;

  return (
    <motion.button
      whileHover={!disabled && !loading ? { scale: 1.02 } : {}}
      whileTap={!disabled && !loading ? { scale: 0.98 } : {}}
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {icon && iconPosition === "left" && <span className="flex-shrink-0">{icon}</span>}
          {children}
          {icon && iconPosition === "right" && <span className="flex-shrink-0">{icon}</span>}
        </>
      )}
    </motion.button>
  );
};

export default PremiumButton;
