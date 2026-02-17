import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { setCredentials } from "../../../redux/slices/authSlice";
import { validateSignup } from "../../../utils/validation";
import { signupUser } from "../../../utils/api";
import { useUsers } from "../../../context/UserContext";
import { motion } from "framer-motion";
import { TbMail, TbLock, TbUser, TbEye, TbEyeOff, TbSun, TbMoon, TbBriefcase } from "react-icons/tb";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { useTheme } from "../../../context/ThemeContext";

const Signup = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { users, addUser } = useUsers();
  const { theme, toggleTheme } = useTheme();

  const [values, setValues] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
    user_type: "",
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => setValues({ ...values, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateSignup(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      if (loading) return;
      setLoading(true);
      setServerError("");

      // Call backend signup
      const res = await signupUser(values);

      // If signup returns token + user, auto-login
      if (res?.user && res?.token) {
        dispatch(setCredentials({ user: res.user, token: res.token }));
        localStorage.setItem("token", res.token);
        localStorage.setItem("user", JSON.stringify(res.user));
        navigate("/landing");
      } else {
        // Otherwise just redirect to login
        addUser({ name: values.full_name, email: values.email });
        navigate("/login");
      }
    } catch (err) {
      // Prefer backend message when available
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Signup failed";
      console.error("Signup error:", err?.response || err?.message || err);
      setServerError(msg);
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
        className="relative z-10 w-full max-w-md p-8 bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl my-10"
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
            Create Account
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            Join the Synthetic People platform
          </p>
        </div>

        {serverError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-600 dark:text-red-200 text-sm text-center"
          >
            {serverError}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="relative group">
            <TbUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              name="full_name"
              value={values.full_name}
              onChange={handleChange}
              placeholder="Full Name"
              className={`w-full bg-gray-50 dark:bg-black/20 border ${errors.full_name ? 'border-red-500/50' : 'border-gray-200 dark:border-white/10 group-hover:border-blue-500/30 dark:group-hover:border-white/20'} rounded-xl py-3.5 pl-12 pr-4 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 transition-all`}
            />
            {errors.full_name && <span className="text-xs text-red-400 mt-1 ml-1">{errors.full_name}</span>}
          </div>

          {/* Email */}
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
            {errors.email && <span className="text-xs text-red-400 mt-1 ml-1">{errors.email}</span>}
          </div>

          {/* User Type */}
          <div className="relative group">
            <TbBriefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
            <select
              name="user_type"
              value={values.user_type}
              onChange={handleChange}
              className={`w-full bg-gray-50 dark:bg-black/20 border ${errors.user_type ? 'border-red-500/50' : 'border-gray-200 dark:border-white/10 group-hover:border-blue-500/30 dark:group-hover:border-white/20'} rounded-xl py-3.5 pl-12 pr-4 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 dark:focus:ring-blue-500/50 transition-all appearance-none`}
            >
              <option value="" className="bg-white dark:bg-[#1a1f3a]">Select User Type</option>
              <option value="Startup" className="bg-white dark:bg-[#1a1f3a]">Startup</option>
              <option value="Student" className="bg-white dark:bg-[#1a1f3a]">Student</option>
              <option value="Researcher" className="bg-white dark:bg-[#1a1f3a]">Researcher</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
            {errors.user_type && <span className="text-xs text-red-400 mt-1 ml-1">{errors.user_type}</span>}
          </div>

          {/* Password */}
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
            className={`w-full py-3.5 rounded-xl font-semibold text-white shadow-lg shadow-blue-500/20 transition-all mt-6
              ${loading
                ? "bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-70"
                : "bg-gradient-to-r from-blue-primary via-blue-primary-dark to-blue-primary hover:shadow-blue-primary/40 bg-[length:200%_auto] hover:bg-right transition-all duration-500"
              }`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Signing up...</span>
              </div>
            ) : (
              "Sign Up"
            )}
          </motion.button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-blue-600 dark:text-blue-primary-light hover:text-blue-500 dark:hover:text-blue-primary-lighter transition-colors"
            >
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;