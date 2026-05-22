import React, { useState } from "react";
import { Link } from "react-router-dom";
import { sendResetEmail } from "../../../utils/api";
import { validateForgotPassword } from "../../../utils/validation";
import { motion } from "framer-motion";
import HalfGlobe from "./HalfGlobe";
import Logo from "../../common/Logo";
import SpIcon from '../../SPIcon'
import "./ForgotPassword.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ForgotPasswordErrors {
  email?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [errors, setErrors] = useState<ForgotPasswordErrors>({});
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateForgotPassword({ email });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await sendResetEmail({ email });
      setMessage(res.data.message || "Password reset link sent to your email.");
    } catch (err: any) {
      setError(err.response?.data?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success state — Figma image 2 ─────────────────────────────────────────

  if (message) {
    return (
      <div className="fp-page">
        <Logo />
        <div className="globe-container">
          <HalfGlobe />
        </div>
        <div className="gradient-top" />
        <div className="gradient-bottom" />

        <div className="fp-card-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="login-card fp-card"
          >
            <div className="card-header">
              <h1>Forgot Password</h1>
            </div>

            <div className="fp-success-body">
              <p className="fp-success-text">{message}</p>
              <Link to="/login" className="fp-okay-btn">
                Okay, Got it!
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Default state — Figma image 1 ─────────────────────────────────────────

  return (
    <div className="fp-page">
      <Logo />

      <div className="globe-container">
        <HalfGlobe />
      </div>

      <div className="gradient-top" />
      <div className="gradient-bottom" />

      <div className="fp-card-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="login-card fp-card"
        >
          <div className="card-header">
            <h1>Forgot Password</h1>
          </div>

          <form onSubmit={handleSubmit} className="card-body">

            {/* API error banner */}
            {error && (
              <div className="error-banner">{error}</div>
            )}

            {/* Email field */}
            <div className="form-group">
              <label>
                Email Address <span>*</span>
              </label>
              <input
                type="text"
                name="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                placeholder="Enter email address"
                className={errors.email ? "error" : ""}
              />
              {errors.email && (
                <small className="message error">{errors.email}</small>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className={`continue-btn ${!loading && email ? "active" : ""}`}
            >
              {loading ? (
                <div className="loading-spinner">
                  <div className="spinner" />
                  <span>Sending...</span>
                </div>
              ) : (
                <>
                  Send Reset Link <SpIcon name="sp-Arrow-Arrow_Right_SM" />
                </>
              )}
            </button>

          </form>

          <div className="card-footer">
            <p className="signin-text">
              <Link to="/login" className="fp-back-link">
                ← Back to Login
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPassword;