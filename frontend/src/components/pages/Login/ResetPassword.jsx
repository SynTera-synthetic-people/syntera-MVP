import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { resetPassword } from "../../../utils/api";
import { validateResetPassword } from "../../../utils/validation";
import { motion } from "framer-motion";
import { TbLock, TbEye, TbEyeOff, TbSun, TbMoon } from "react-icons/tb";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { useTheme } from "../../../context/ThemeContext";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [values, setValues] = useState({ password: "", confirm_password: "" });
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    setValues({ ...values, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateResetPassword(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      // Backend expects: { new_password: "..." }
      await resetPassword(token, {
        new_password: values.password,
      });

      setSuccess("Password reset successful! Redirecting to login...");
      setError("");

      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired token.");
      setSuccess("");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-gray-50 dark:bg-[#0f1115] transition-colors duration-300">
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md p-8 bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl"
      >
         <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-block mb-4"
          >
             <img src={theme === 'dark' ? logoForDark : logoForLight} alt="Logo" className="h-20 w-auto object-contain" />
          </motion.div>
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-900 to-blue-600 dark:from-white dark:to-blue-primary-lighter">
            Reset Password
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            Enter your new password below
          </p>
        </div>

        {success && <div className="mb-4 p-3 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm text-center border border-green-200 dark:border-green-800">{success}</div>}
        {error && <div className="mb-4 p-3 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm text-center border border-red-200 dark:border-red-800">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
           {/* Password */}
           <div className="relative group">
            <TbLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={values.password}
              onChange={handleChange}
              placeholder="New Password"
              className={`w-full bg-gray-50 dark:bg-black/20 border ${errors.password ? 'border-red-500/50' : 'border-gray-200 dark:border-white/10 group-hover:border-blue-500/30 dark:group-hover:border-white/20'} rounded-xl py-3.5 pl-12 pr-12 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 transition-all`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              {showPassword ? <TbEyeOff /> : <TbEye />}
            </button>
            {errors.password && <span className="text-xs text-red-400 mt-1 ml-1">{errors.password}</span>}
          </div>

          {/* Confirm Password */}
          <div className="relative group">
            <TbLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirm_password"
              value={values.confirm_password}
              onChange={handleChange}
              placeholder="Confirm Password"
              className={`w-full bg-gray-50 dark:bg-black/20 border ${errors.confirm_password ? 'border-red-500/50' : 'border-gray-200 dark:border-white/10 group-hover:border-blue-500/30 dark:group-hover:border-white/20'} rounded-xl py-3.5 pl-12 pr-12 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 transition-all`}
            />
             <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
            >
              {showConfirmPassword ? <TbEyeOff /> : <TbEye />}
            </button>
            {errors.confirm_password && <span className="text-xs text-red-400 mt-1 ml-1">{errors.confirm_password}</span>}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-xl font-semibold text-white shadow-lg shadow-blue-500/20 transition-all
              ${loading 
                ? "bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-70" 
                : "bg-gradient-to-r from-blue-primary via-blue-primary-dark to-blue-primary hover:shadow-blue-primary/40 bg-[length:200%_auto] hover:bg-right transition-all duration-500"
              }`}
          >
            {loading ? "Msg: Resetting..." : "Reset Password"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
