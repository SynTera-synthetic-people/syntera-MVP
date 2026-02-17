import React from "react";
import { motion } from "framer-motion";

/**
 * GlassCard - Reusable glassmorphic card component
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.variant - Card style variant: 'default' | 'hover' | 'gradient' | 'stat'
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.animated - Enable entrance animation
 * @param {number} props.delay - Animation delay in seconds
 * @param {Function} props.onClick - Click handler
 */
const GlassCard = ({ 
  children, 
  variant = "default", 
  className = "", 
  animated = false,
  delay = 0,
  onClick,
  ...props 
}) => {
  const baseClasses = "backdrop-blur-xl rounded-2xl transition-all duration-300";
  
  const variants = {
    default: "bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 shadow-xl",
    hover: "bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 shadow-xl hover:shadow-2xl hover:scale-[1.02] cursor-pointer",
    gradient: "bg-white dark:bg-white/5 border-2 border-transparent bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-500/10 dark:to-purple-500/10 shadow-xl",
    stat: "bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 shadow-xl hover:shadow-2xl transition-all group"
  };

  const cardClasses = `${baseClasses} ${variants[variant]} ${className}`;

  const CardComponent = animated ? motion.div : "div";
  
  const animationProps = animated ? {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.5 }
  } : {};

  return (
    <CardComponent 
      className={cardClasses}
      onClick={onClick}
      {...animationProps}
      {...props}
    >
      {children}
    </CardComponent>
  );
};

export default GlassCard;
