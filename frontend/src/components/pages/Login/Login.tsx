import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginStart, clearError } from "../../../redux/slices/authSlice";
import { validateLogin } from "../../../utils/validation";
import { motion } from "framer-motion";
import HalfGlobe from "./HalfGlobe";
import Logo from "../../common/Logo";
import SpIcon from '../../SPIcon';
import "./login.css";

interface LoginValues {
  email: string;
  password: string;
}

interface ValidationErrors {
  email?: string;
  password?: string;
  api?: string;
}

interface AuthState {
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  user: {
    user_type?: string;
    role?: string;
  } | null;
}

interface RootState {
  auth: AuthState;
}

const Login: React.FC = () => {
  const [values, setValues] = useState<LoginValues>({ email: "", password: "" });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"" | "success" | "error">("");
  const [showError, setShowError] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { loading, error, isAuthenticated, user } = useSelector(
    (state: RootState) => state.auth
  );

  // ── Email validation ──
  const validateEmail = (value: string): boolean => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  };

  // ── Debounced error display ──
  useEffect(() => {
    if (values.email.trim() === "") {
      setShowError(false);
      return;
    }

    const timer = setTimeout(() => {
      if (emailStatus === "error") {
        setShowError(true);
      } else {
        setShowError(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [values.email, emailStatus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setShowError(false);

    if (errors[name as keyof ValidationErrors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }

    if (name === "email") {
      if (value.trim() === "") {
        setEmailStatus("");
      } else if (!validateEmail(value)) {
        setEmailStatus("error");
      } else {
        setEmailStatus("success");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const validationErrors = validateLogin(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    // @ts-ignore
    dispatch(loginStart(values));
  };

  const isEmailValid = emailStatus === "success";

  return (
    <div className="login-page">
      {/* Half Globe Background */}
      <Logo />

      <div className="globe-container">
        <HalfGlobe />
      </div>

      {/* Gradient Overlays */}
      <div className="gradient-top" />
      <div className="gradient-bottom" />

      {/* Login Card */}
      <div className="login-card-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="login-card"
        >
          <div className="card-header">
            <h1>Welcome</h1>
            <p className="subtitle">True customer understanding starts here</p>
          </div>

          <form onSubmit={handleSubmit} className="card-body">
            {/* Email Field */}
            <div className="form-group">
              <label>
                Email Address <span>*</span>
              </label>

              <input
                type="email"
                name="email"
                value={values.email}
                onChange={handleChange}
                placeholder="Enter email address"
                className={
                  showError && emailStatus === "error"
                    ? "error"
                    : emailStatus === "success"
                      ? "success"
                      : ""
                }
              />

              <small
                className={`message ${showError && emailStatus === "error"
                    ? "error"
                    : emailStatus === "success"
                      ? "success"
                      : ""
                  }`}
              >
                {showError && emailStatus === "error" && "Please enter a valid email"}
                {emailStatus === "success" && "Email is Valid"}
              </small>
            </div>

            {/* Password Field - Only show when email is valid */}
            {isEmailValid && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.3 }}
                className="form-group"
              >
                <label>
                  Password <span>*</span>
                </label>

                <div className="password-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={values.password}
                    onChange={handleChange}
                    placeholder="Enter password"
                  />

                  <span
                    className="eye"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <img src="/hide.svg" alt="Hide password" width="24" height="24" />
                    ) : (
                      <img src="/show.svg" alt="Show password" width="24" height="24" />
                    )}
                  </span>
                </div>

                {errors.password && (
                  <small className="message error">{errors.password}</small>
                )}
              </motion.div>
            )}

            {/* Error Message */}
            {(error || errors.api) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="error-banner"
              >
                {error || errors.api}
              </motion.div>
            )}

            {/* Forgot Password Link */}
            {isEmailValid && (
              <div className="forgot-password-container">
                <Link to="/forgot-password" className="forgot-password-link">
                  Forgot Password?
                </Link>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              className={`continue-btn ${isEmailValid && values.password ? "active" : ""
                }`}
              disabled={!isEmailValid || !values.password || loading}
            >
              {loading ? (
                <div className="loading-spinner">
                  <div className="spinner" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <span className="continue-content">
                  Continue
                  <SpIcon name="sp-Arrow-Arrow_Right_SM" />
                </span>
              )}
            </button>

            <div className="divider">or</div>

            <button type="button" className="google-btn">
              <img src="/google.svg" alt="google" width="18" height="18" />
              Continue with Google
            </button>
          </form>

          <div className="card-footer">
            <p className="signin-text">
              Don't have an account?{" "}
              <Link to="/signup">Create Account</Link>
            </p>

            <p className="terms">
              By continuing, you're agreeing to our{" "}
              <a href="#">Terms and Conditions</a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;