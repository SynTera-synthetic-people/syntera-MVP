// src/hooks/useApi.js
import { useState, useCallback } from "react";
import { handleApiError } from "../utils/api";

/**
 * Custom hook for API calls with loading and error handling
 * @param {Function} apiFunction - The API function to call
 * @returns {Object} { data, loading, error, execute }
 */
export const useApi = (apiFunction) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFunction(...args);
        setData(response.data);
        return response.data;
      } catch (err) {
        const errorInfo = handleApiError(err);
        setError(errorInfo);
        throw errorInfo;
      } finally {
        setLoading(false);
      }
    },
    [apiFunction]
  );

  return { data, loading, error, execute };
};

export default useApi;
