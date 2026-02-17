import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  organizations: [],
  loading: false,
  error: null,
  success: false,
};

const orgSlice = createSlice({
  name: 'organizations',
  initialState,
  reducers: {
    fetchOrganizationsStart: (state) => {
      state.loading = true;
      state.error = null;
      state.success = false;
    },
    fetchOrganizationsSuccess: (state, action) => {
      state.loading = false;
      state.organizations = action.payload;
      state.success = true;
      state.error = null;
    },
    fetchOrganizationsFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
      state.success = false;
    },
    clearOrganizations: (state) => {
      state.organizations = [];
      state.error = null;
      state.success = false;
    },
  },
});

// Export actions
export const {
  fetchOrganizationsStart,
  fetchOrganizationsSuccess,
  fetchOrganizationsFailure,
  clearOrganizations,
} = orgSlice.actions;

// Export reducer
export default orgSlice.reducer;