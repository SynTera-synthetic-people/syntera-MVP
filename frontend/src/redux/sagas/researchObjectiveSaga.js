import { call, put, takeLatest, all } from 'redux-saga/effects';
// import { researchObjectiveService } from '../../services/researchObjectiveService';
import {
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
} from '../slices/researchObjectiveSlice';

function* getResearchObjectiveTemplatesSaga(action) {
  try {
    const { workspaceId } = action.payload;
    const templates = yield call(
      // researchObjectiveService.getResearchObjectiveTemplates,
      workspaceId
    );
    yield put(getResearchObjectiveTemplatesSuccess(templates));
  } catch (error) {
    yield put(getResearchObjectiveTemplatesFailure(error.response?.data || error.message));
  }
}

function* getResearchObjectiveTemplateByIdSaga(action) {
  try {
    const { workspaceId, templateId } = action.payload;
    const template = yield call(
      researchObjectiveService.getResearchObjectiveTemplateById,
      workspaceId,
      templateId
    );
    yield put(getResearchObjectiveTemplateByIdSuccess(template));
  } catch (error) {
    yield put(getResearchObjectiveTemplateByIdFailure(error.response?.data || error.message));
  }
}

function* createResearchObjectiveSaga(action) {
  try {
    const { workspaceId, data } = action.payload;
    const response = yield call(
      // researchObjectiveService.createResearchObjective,
      workspaceId,
      data
    );

    console.log('Create objective response:', response);

    // Handle different response formats
    const newObjective = response.data || response;
    console.log('Parsed objective:', newObjective);

    yield put(createResearchObjectiveSuccess(newObjective));

    // Extract objective ID - could be in different places
    const objectiveId = newObjective.id || newObjective.objective_id || newObjective._id;
    console.log('Extracted objective ID:', objectiveId);

    // After successful creation, fetch the full objective details
    if (objectiveId) {
      console.log('Fetching created objective details for ID:', objectiveId);
      try {
        const objectiveDetails = yield call(
          // researchObjectiveService.getResearchObjective,
          workspaceId,
          objectiveId
        );
        console.log('Fetched objective details:', objectiveDetails);
        yield put(getResearchObjectiveSuccess(objectiveDetails));
      } catch (fetchError) {
        console.error('Error fetching objective details:', fetchError);
        // Don't fail the whole creation if GET fails
      }
    } else {
      console.warn('No objective ID found in response, skipping GET request');
    }
  } catch (error) {
    console.error('Error creating research objective:', error);
    yield put(createResearchObjectiveFailure(error.response?.data || error.message));
  }
}

function* getResearchObjectivesSaga(action) {
  try {
    const { workspaceId } = action.payload;
    const objectives = yield call(
      researchObjectiveService.getResearchObjectives,
      workspaceId
    );
    yield put(getResearchObjectivesSuccess(objectives));
  } catch (error) {
    yield put(getResearchObjectivesFailure(error.response?.data || error.message));
  }
}

function* getResearchObjectiveSaga(action) {
  try {
    const { workspaceId, objectiveId } = action.payload;
    const objective = yield call(
      // researchObjectiveService.getResearchObjective,
      workspaceId,
      objectiveId
    );
    yield put(getResearchObjectiveSuccess(objective));
  } catch (error) {
    yield put(getResearchObjectiveFailure(error.response?.data || error.message));
  }
}

function* updateResearchObjectiveSaga(action) {
  try {
    const { objectiveId, data } = action.payload;
    const updatedObjective = yield call(
      researchObjectiveService.updateResearchObjective,
      objectiveId,
      data
    );
    yield put(updateResearchObjectiveSuccess(updatedObjective));
  } catch (error) {
    yield put(updateResearchObjectiveFailure(error.response?.data || error.message));
  }
}

function* deleteResearchObjectiveSaga(action) {
  try {
    const { objectiveId } = action.payload;
    // yield call(researchObjectiveService.deleteResearchObjective, objectiveId);
    yield put(deleteResearchObjectiveSuccess(objectiveId));
  } catch (error) {
    yield put(deleteResearchObjectiveFailure(error.response?.data || error.message));
  }
}

export default function* researchObjectiveSaga() {
  yield all([
    takeLatest(
      getResearchObjectiveTemplatesStart.type,
      getResearchObjectiveTemplatesSaga
    ),
    takeLatest(
      getResearchObjectiveTemplateByIdStart.type,
      getResearchObjectiveTemplateByIdSaga
    ),
    takeLatest(createResearchObjectiveStart.type, createResearchObjectiveSaga),
    takeLatest(getResearchObjectivesStart.type, getResearchObjectivesSaga),
    takeLatest(getResearchObjectiveStart.type, getResearchObjectiveSaga),
    takeLatest(updateResearchObjectiveStart.type, updateResearchObjectiveSaga),
    takeLatest(deleteResearchObjectiveStart.type, deleteResearchObjectiveSaga),
  ]);
}
