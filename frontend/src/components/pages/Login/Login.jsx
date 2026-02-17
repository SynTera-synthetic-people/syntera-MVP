import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginStart, clearError } from "../../../redux/slices/authSlice";
import { validateLogin } from "../../../utils/validation";
import { motion } from "framer-motion";
import { TbMail, TbLock, TbEye, TbEyeOff, TbSun, TbMoon } from "react-icons/tb";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { useTheme } from "../../../context/ThemeContext";

const Login = () => {
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { loading, error, isAuthenticated, user } = useSelector((state) => state.auth);

  useEffect(() => {
    if (isAuthenticated && user) {
      const isSuperAdmin =
        user?.user_type === "Super Admin" ||
        user?.user_type === "super_admin" ||
        user?.role === "Super Admin" ||
        user?.role === "super_admin";

      if (isSuperAdmin) {
        navigate("/admin/dashboard");
      } else {
        navigate("/landing");
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    // if (error) dispatch(clearError());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrors({});
    const validationErrors = validateLogin(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    dispatch(loginStart(values));
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
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-900 to-blue-600 dark:from-white dark:to-blue-primary-lighter">
            SIMULATE. UNDERSTAND. DECIDE
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            Enter your credentials to access your workspace
          </p>
        </div>

        {(error || errors.api) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-200 text-sm text-center"
          >
            {error || errors.api}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            {/* Email Field */}
            <div className="relative group">
              <TbMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="email"
                name="email"
                value={values.email}
                onChange={handleChange}
                placeholder="Email Address"
                className={`w-full bg-gray-50 dark:bg-black/20 border ${errors.email ? 'border-red-500/50' : 'border-gray-200 dark:border-white/10 group-hover:border-blue-500/30 dark:group-hover:border-white/20'} rounded-xl py-3.5 pl-12 pr-4 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 transition-all`}
              />
              {errors.email && (
                <span className="text-xs text-red-400 mt-1 ml-1">{errors.email}</span>
              )}
            </div>

            {/* Password Field */}
            <div className="relative group">
              <TbLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={values.password}
                onChange={handleChange}
                placeholder="Password"
                className={`w-full bg-gray-50 dark:bg-black/20 border ${errors.password ? 'border-red-500/50' : 'border-gray-200 dark:border-white/10 group-hover:border-blue-500/30 dark:group-hover:border-white/20'} rounded-xl py-3.5 pl-12 pr-12 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 transition-all`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                {showPassword ? <TbEyeOff /> : <TbEye />}
              </button>
              {errors.password && (
                <span className="text-xs text-red-400 mt-1 ml-1">{errors.password}</span>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              Forgot Password?
            </Link>
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
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Signing in...</span>
              </div>
            ) : (
              "Sign In"
            )}
          </motion.button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="font-medium text-blue-600 dark:text-blue-primary-light hover:text-blue-500 dark:hover:text-blue-primary-lighter transition-colors"
            >
              Create Account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;