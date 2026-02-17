import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  templates: [],
  objectives: [],
  loading: false,
  error: null,
};

const researchObjectiveSlice = createSlice({
  name: 'researchObjective',
  initialState,
  reducers: {
    // Get Templates
    getResearchObjectiveTemplatesStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getResearchObjectiveTemplatesSuccess: (state, action) => {
      state.loading = false;
      const templates = action.payload.data || action.payload;
      state.templates = Array.isArray(templates) ? templates : [];
    },
    getResearchObjectiveTemplatesFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Get Template By Id
    getResearchObjectiveTemplateByIdStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getResearchObjectiveTemplateByIdSuccess: (state, action) => {
      state.loading = false;
      // You might want to store the selected template in a separate state property
      state.selectedTemplate = action.payload;
    },
    getResearchObjectiveTemplateByIdFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Create Research Objective
    createResearchObjectiveStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    createResearchObjectiveSuccess: (state, action) => {
      state.loading = false;
      state.objectives.push(action.payload);
      // state.selectedObjective = action.payload;
    },
    createResearchObjectiveFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Get Research Objectives
    getResearchObjectivesStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getResearchObjectivesSuccess: (state, action) => {
      state.loading = false;
      state.objectives = action.payload;
    },
    getResearchObjectivesFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Get Research Objective
    getResearchObjectiveStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    getResearchObjectiveSuccess: (state, action) => {
      state.loading = false;
      // You might want to store the selected objective in a separate state property
      state.selectedObjective = action.payload;
    },
    getResearchObjectiveFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Update Research Objective
    updateResearchObjectiveStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    updateResearchObjectiveSuccess: (state, action) => {
      state.loading = false;
      state.objectives = state.objectives.map((objective) =>
        objective.id === action.payload.id ? action.payload : objective
      );
    },
    updateResearchObjectiveFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },

    // Delete Research Objective
    deleteResearchObjectiveStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    deleteResearchObjectiveSuccess: (state, action) => {
      state.loading = false;
      state.objectives = state.objectives.filter(
        (objective) => objective.id !== action.payload
      );
    },
    deleteResearchObjectiveFailure: (state, action) => {
      state.loading = false;
      state.error = action.payload;
    },
  },
});

export const {
  getResearchObjectiveTemplatesStart,
  getResearchObjectiveTemplatesSuccess,
  getResearchObjectiveTemplatesFailure,
  getResearchObjectiveTemplateByIdStart,
  getResearchObjectiveTemplateByIdSuccess,
  getResearchObjectiveTemplateByIdFailure,
  createResearchObjectiveStart,
  createResearchObjectiveSuccess,
  createResearchObjectiveFailure,
  getResearchObjectivesStart,
  getResearchObjectivesSuccess,
  getResearchObjectivesFailure,
  getResearchObjectiveStart,
  getResearchObjectiveSuccess,
  getResearchObjectiveFailure,
  updateResearchObjectiveStart,
  updateResearchObjectiveSuccess,
  updateResearchObjectiveFailure,
  deleteResearchObjectiveStart,
  deleteResearchObjectiveSuccess,
  deleteResearchObjectiveFailure,
} = researchObjectiveSlice.actions;

export default researchObjectiveSlice.reducer;
