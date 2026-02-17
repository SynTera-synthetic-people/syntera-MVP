// src/redux/slices/omiSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  session: null,
  sessionId: null,
  isInitialized: false,
  loading: false,
  error: null,
  messages: [],
  guidanceData: null, // <-- STORE GUIDANCE DATA
  validationData: null, // <-- STORE VALIDATION DATA
  orgId: null, // <-- STORE ORG ID
};

const omiSlice = createSlice({
  name: 'omi',
  initialState,
  reducers: {
    /** ---------------------------
     * Initialize Session 
     * --------------------------*/
    initializeSessionStart: (state, action) => {
      state.loading = true;
      state.error = null;

      // Save orgId from payload
      state.orgId = action.payload?.orgId || state.orgId;
    },

    initializeSessionSuccess: (state, action) => {
      state.loading = false;
      state.session = action.payload;
      state.sessionId = action.payload.session_id || action.payload.sessionId;
      state.isInitialized = true;
      state.error = null;
    },

    initializeSessionFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
      state.isInitialized = false;
    },

    sendMessageStart: (state, action) => {
      state.loading = true;
      state.error = null;

      // Optional: Extract orgId/sessionId from payload for debugging
      if (action.payload?.orgId) state.orgId = action.payload.orgId;
    },

    sendMessageSuccess: (state, action) => {
      state.loading = false;
      state.messages.push(action.payload);
      state.error = null;
    },

    sendMessageFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    chatWithOmiStart: (state, action) => {
      state.loading = true;
      state.error = null;
      if (action.payload?.orgId) state.orgId = action.payload.orgId;
    },

    chatWithOmiSuccess: (state, action) => {
      state.loading = false;
      state.messages.push(action.payload);
      state.error = null;
    },

    chatWithOmiFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    /** ---------------------------
     * Get Guidance
     * --------------------------*/
    getGuidanceStart: (state, action) => {
      state.loading = true;
      state.error = null;
      if (action.payload?.orgId) state.orgId = action.payload.orgId;
    },

    getGuidanceSuccess: (state, action) => {
      state.loading = false;
      state.guidanceData = action.payload;
      state.error = null;
    },

    getGuidanceFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    /** ---------------------------
     * Validation
     * --------------------------*/
     validateStart: (state, action) => {
      state.loading = true;
      state.error = null;
      if (action.payload?.orgId) state.orgId = action.payload.orgId;
    },

    validateSuccess: (state, action) => {
      state.loading = false;
      state.validationData = action.payload;
      state.error = null;
    },

    validateFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    /** ---------------------------
     * Update State
     * --------------------------*/
    updateStateStart: (state, action) => {
      state.loading = true;
      state.error = null;
      if (action.payload?.orgId) state.orgId = action.payload.orgId;
    },

    updateStateSuccess: (state, action) => {
      state.loading = false;
      // Optionally update local state if backend returns the full state object
      if (action.payload) {
         // Assuming payload has structure like { data: { current_state, current_stage, completed_stages } }
         // or just the data object directly. Adjust based on actual API response.
         // For now, let's just clear error and loading. 
         // If we want to store it:
         // state.currentState = action.payload; 
      }
      state.error = null;
    },

    updateStateFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    setSessionHistory: (state, action) => {
      state.messages = action.payload;
    },


    endSessionStart: (state) => {
      state.loading = true;
      state.error = null;
    },

    endSessionSuccess: (state) => {
      state.loading = false;
      state.session = null;
      state.sessionId = null;
      state.isInitialized = false;
      state.messages = [];
      state.error = null;
    },

    endSessionFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    /** ---------------------------
     * Other utilities
     * --------------------------*/
    clearError: (state) => {
      state.error = null;
    },

    resetOmiState: () => initialState,
  },
});

// Export actions
export const {
  initializeSessionStart,
  initializeSessionSuccess,
  initializeSessionFailure,
  sendMessageStart,
  sendMessageSuccess,
  sendMessageFailure,
  chatWithOmiStart,
  chatWithOmiSuccess,
  chatWithOmiFailure,
  getGuidanceStart,
  getGuidanceSuccess,
  getGuidanceFailure,
  validateStart,
  validateSuccess,
  validateFailure,
  updateStateStart,
  updateStateSuccess,
  updateStateFailure,
  setSessionHistory,
  endSessionStart,
  endSessionSuccess,
  endSessionFailure,
  clearError,
  resetOmiState,
} = omiSlice.actions;

// Export reducer
export default omiSlice.reducer;
