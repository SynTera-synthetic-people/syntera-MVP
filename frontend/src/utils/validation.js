// src/utils/validation.js
export const validateLogin = (values) => {
  const errors = {};
  const email = String(values.email || "").trim();
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
  if (!email) errors.email = "Email is required";
  else if (!emailRegex.test(email)) errors.email = "Invalid email";
  if (!values.password) errors.password = "Password is required";
  return errors;
};

export const validateSignup = (values) => {
  const errors = {};
  if (!values.full_name.trim()) errors.full_name = "Name is required";
  const email = String(values.email || "").trim();
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
  if (!email) errors.email = "Email is required";
  else if (!emailRegex.test(email)) errors.email = "Invalid email";
  if (!values.password) errors.password = "Password is required";
  else if (values.password.length < 6)
    errors.password = "Minimum 6 characters required";
  if (values.confirm_password !== values.password)
    errors.confirm_password = "Passwords do not match";
  return errors;
};

export const validateWorkspace = (values) => {
  const errors = {};
  if (!values.title || !String(values.title).trim()) {
    errors.title = "Workspace title is required";
  }
  return errors;
};

export const validateForgotPassword = (values) => {
  const errors = {};
  const email = String(values.email || "").trim();
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
  if (!email) errors.email = "Email is required";
  else if (!emailRegex.test(email)) errors.email = "Invalid email";
  return errors;
};

export const validateResetPassword = (values) => {
  const errors = {};
  if (!values.password) errors.password = "Password is required";
  else if (values.password.length < 6) errors.password = "Minimum 6 characters required";
  if (values.confirm_password !== values.password) errors.confirm_password = "Passwords do not match";
  return errors;
};

export const validateInvite = (values) => {
  const errors = {};
  const email = String(values.email || "").trim();
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
  if (!email) errors.email = "Email is required";
  else if (!emailRegex.test(email)) errors.email = "Invalid email";
  return errors;
};
