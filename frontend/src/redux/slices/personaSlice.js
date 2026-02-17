import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  personas: [],
  personaTemplates: [],
  selectedPersona: null,
  personaPreview: null,
  loading: false,
  error: null,
};

const personaSlice = createSlice({
  name: 'persona',
  initialState,
  reducers: {
    // Get Persona Templates
    getPersonaTemplatesStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getPersonaTemplatesSuccess: (state, action) => {
      state.loading = false;
      state.personaTemplates = action.payload;
    },
   getPersonaTemplatesFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Create Persona
    createPersonaStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    createPersonaSuccess: (state, action) => {
      state.loading = false;
      state.personas.push(action.payload);
    },
    createPersonaFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Get Personas
    getPersonasStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getPersonasSuccess: (state, action) => {
      state.loading = false;
      state.personas = action.payload;
    },
    getPersonasFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Get Single Persona
    getPersonaStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getPersonaSuccess: (state, action) => {
      state.loading = false;
      state.selectedPersona = action.payload;
    },
    getPersonaFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Update Persona
    updatePersonaStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    updatePersonaSuccess: (state, action) => {
      state.loading = false;
      state.personas = state.personas.map((persona) =>
        persona.id === action.payload.id ? action.payload : persona
      );
      if (state.selectedPersona?.id === action.payload.id) {
        state.selectedPersona = action.payload;
      }
    },
    updatePersonaFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Delete Persona
    deletePersonaStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    deletePersonaSuccess: (state, action) => {
      state.loading = false;
      state.personas = state.personas.filter(
        (persona) => persona.id !== action.payload
      );
      if (state.selectedPersona?.id === action.payload) {
        state.selectedPersona = null;
      }
    },
    deletePersonaFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Get Persona Preview
    getPersonaPreviewStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getPersonaPreviewSuccess: (state, action) => {
      state.loading = false;
      state.personaPreview = action.payload;
    },
    getPersonaPreviewFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
  },
});

export const {
  getPersonaTemplatesStart,
  getPersonaTemplatesSuccess,
  getPersonaTemplatesFailure,
  createPersonaStart,
  createPersonaSuccess,
  createPersonaFailure,
  getPersonasStart,
  getPersonasSuccess,
  getPersonasFailure,
  getPersonaStart,
  getPersonaSuccess,
  getPersonaFailure,
  updatePersonaStart,
  updatePersonaSuccess,
  updatePersonaFailure,
  deletePersonaStart,
  deletePersonaSuccess,
  deletePersonaFailure,
  getPersonaPreviewStart,
  getPersonaPreviewSuccess,
  getPersonaPreviewFailure,
} = personaSlice.actions;

export default personaSlice.reducer;
