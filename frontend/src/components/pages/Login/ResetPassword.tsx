import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { resetPassword } from "../../../utils/api";
import { validateResetPassword } from "../../../utils/validation";
import HalfGlobe from "./HalfGlobe";
import "./ResetPassword.css";

interface ResetPasswordValues {
  password: string;
  confirm_password: string;
}

interface ValidationErrors {
  password?: string;
  confirm_password?: string;
}

interface RequirementProps {
  met: boolean;
  text: string;
  showState?: boolean;
}

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [values, setValues] = useState<ResetPasswordValues>({
    password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password validation requirements
  const hasNumber = /\d/.test(values.password);
  const hasUppercase = /[A-Z]/.test(values.password);
  const hasLowercase = /[a-z]/.test(values.password);
  const hasMinLength = values.password.length >= 8;

  const passwordsMatch =
    values.confirm_password.length > 0 &&
    values.password === values.confirm_password;

  const isValid =
    hasNumber &&
    hasUppercase &&
    hasLowercase &&
    hasMinLength &&
    passwordsMatch;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ ...values, [e.target.name]: e.target.value });
    // Clear specific field error when user starts typing
    if (errors[e.target.name as keyof ValidationErrors]) {
      setErrors({ ...errors, [e.target.name]: "" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateResetPassword(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    setErrors({});
    setLoading(true);

    try {
      await resetPassword(token!, {
        new_password: values.password,
      });

      setSuccess("Password reset successful! Redirecting to login...");
      setError("");

      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid or expired token.");
      setSuccess("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-password-page">
      {/* Half Globe Background */}
      <div className="globe-container">
        <HalfGlobe />
      </div>

      {/* Gradient Overlays */}
      <div className="gradient-top" />
      <div className="gradient-bottom" />

      {/* Reset Password Card */}
      <div className="reset-card-container">
        <div className="login-card">
          <div className="card-header">
            <h1>Reset Your Password</h1>
            <p className="subtitle">Enter your new password below</p>
          </div>

          <form onSubmit={handleSubmit} className="card-body">
            {/* Success Message */}
            {success && (
              <div className="success-banner">
                {success}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="error-banner">
                {error}
              </div>
            )}

            {/* Password Field */}
            <div className="form-group">
              <label>
                New Password <span>*</span>
              </label>

              <div className="password-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={values.password}
                  onChange={handleChange}
                  placeholder="Enter new password"
                />

                <span
                  className="eye"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <img
                      src="/Icons/hide.svg"
                      alt="Hide password"
                      width="24"
                      height="24"
                    />
                  ) : (
                    <img
                      src="/Icons/show.svg"
                      alt="Show password"
                      width="24"
                      height="24"
                    />
                  )}
                </span>
              </div>

              <div className="requirements">
                <Requirement
                  met={hasNumber}
                  text="At least one number"
                  showState={values.password.length > 0}
                />
                <Requirement
                  met={hasUppercase}
                  text="At least one uppercase letter"
                  showState={values.password.length > 0}
                />
                <Requirement
                  met={hasLowercase}
                  text="At least one lowercase letter"
                  showState={values.password.length > 0}
                />
                <Requirement
                  met={hasMinLength}
                  text="At least 8 characters"
                  showState={values.password.length > 0}
                />
              </div>

              {errors.password && (
                <small className="message error">{errors.password}</small>
              )}
            </div>

            {/* Confirm Password Field */}
            <div className="form-group">
              <label>
                Confirm Password <span>*</span>
              </label>

              <div className="password-wrapper">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirm_password"
                  value={values.confirm_password}
                  onChange={handleChange}
                  placeholder="Confirm new password"
                />

                <span
                  className="eye"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <img
                      src="/Icons/hide.svg"
                      alt="Hide password"
                      width="24"
                      height="24"
                    />
                  ) : (
                    <img
                      src="/Icons/show.svg"
                      alt="Show password"
                      width="24"
                      height="24"
                    />
                  )}
                </span>
              </div>

              <div className="requirements">
                <Requirement
                  met={passwordsMatch}
                  text="Passwords match"
                  showState={values.confirm_password.length > 0}
                />
              </div>

              {errors.confirm_password && (
                <small className="message error">{errors.confirm_password}</small>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className={`continue-btn ${isValid ? "active" : ""}`}
              disabled={!isValid || loading}
            >
              {loading ? "Resetting Password..." : "Reset Password →"}
            </button>
          </form>

          <div className="card-footer">
            <p className="signin-text">
              Remember your password?{" "}
              <a href="/login">Back to Login</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function Requirement({ met, text, showState = true }: RequirementProps) {
  return (
    <div
      className={`requirement ${showState ? (met ? "met" : "error") : ""}`}
    >
      <span className="circle">{showState && met ? "✓" : ""}</span>
      {text}
    </div>
  );
}

export default ResetPassword;