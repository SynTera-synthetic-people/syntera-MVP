// src/config/apiConfig.js
/**
 * API Configuration
 * Uses environment variables for flexible deployment
 */

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8080",
  // BACKEND_URL: import.meta.env.VITE_BACKEND_URL || "http://soaplike-ramonita-nondimensioned.ngrok-free.dev",
  TIMEOUT: parseInt(import.meta.env.VITE_API_TIMEOUT || "30000"),
  ENABLE_DEBUG: import.meta.env.VITE_ENABLE_DEBUG === "true"
};

export default API_CONFIG;
