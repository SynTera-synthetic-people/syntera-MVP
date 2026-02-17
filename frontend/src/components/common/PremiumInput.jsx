import React, { useState } from "react";
import { TbEye, TbEyeOff } from "react-icons/tb";

/**
 * PremiumInput - Reusable input component with premium styling
 * 
 * @param {Object} props
 * @param {string} props.type - Input type
 * @param {string} props.name - Input name
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.error - Error message
 * @param {React.ReactNode} props.icon - Left icon element
 * @param {React.ReactNode} props.rightIcon - Right icon element
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showPasswordToggle - Show password toggle for password inputs
 */
const PremiumInput = ({ 
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  error,
  icon,
  rightIcon,
  className = "",
  showPasswordToggle = true,
  ...props 
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  const baseClasses = "w-full rounded-xl py-3.5 transition-all";
  const paddingClasses = `${icon ? "pl-12" : "pl-4"} ${rightIcon || isPassword ? "pr-12" : "pr-4"}`;
  const colorClasses = "bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white placeholder-gray-500";
  const borderClasses = error 
    ? "border border-red-500/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/50" 
    : "border border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50";

  const inputClasses = `${baseClasses} ${paddingClasses} ${colorClasses} ${borderClasses} focus:outline-none ${className}`;

  return (
    <div className="relative group w-full">
      {icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors">
          {icon}
        </div>
      )}
      
      <input
        type={inputType}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClasses}
        {...props}
      />

      {isPassword && showPasswordToggle && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          {showPassword ? <TbEyeOff size={20} /> : <TbEye size={20} />}
        </button>
      )}

      {rightIcon && !isPassword && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
          {rightIcon}
        </div>
      )}

      {error && (
        <span className="text-xs text-red-400 mt-1 ml-1 block">{error}</span>
      )}
    </div>
  );
};

export default PremiumInput;
