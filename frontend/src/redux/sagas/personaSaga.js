import { call, put, takeLatest, all } from 'redux-saga/effects';
import { personaService } from '../../services/personaService';
import {
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
} from '../slices/personaSlice';

function* getPersonaTemplatesSaga(action) {
  try {
    const { workspaceId, objectiveId } = action.payload;
    const templates = yield call(
      personaService.getPersonaTemplates,
      workspaceId,
      objectiveId
    );
    yield put(getPersonaTemplatesSuccess(templates));
  } catch (error) {
    yield put(getPersonaTemplatesFailure(error.response?.data || error.message));
  }
}

function* createPersonaSaga(action) {
  try {
    const { workspaceId, objectiveId, data } = action.payload;
    const persona = yield call(
      personaService.createPersona,
      workspaceId,
      objectiveId,
      data
    );
    yield put(createPersonaSuccess(persona));
  } catch (error) {
    yield put(createPersonaFailure(error.response?.data || error.message));
  }
}

function* getPersonasSaga(action) {
  try {
    const { workspaceId, objectiveId } = action.payload;
    const personas = yield call(
      personaService.getPersonas,
      workspaceId,
      objectiveId
    );
    yield put(getPersonasSuccess(personas));
  } catch (error) {
    yield put(getPersonasFailure(error.response?.data || error.message));
  }
}

function* getPersonaSaga(action) {
  try {
    const { workspaceId, objectiveId, personaId } = action.payload;
    const persona = yield call(
      personaService.getPersona,
      workspaceId,
      objectiveId,
      personaId
    );
    yield put(getPersonaSuccess(persona));
  } catch (error) {
    yield put(getPersonaFailure(error.response?.data || error.message));
  }
}

function* updatePersonaSaga(action) {
  try {
    const { personaId, data } = action.payload;
    const updatedPersona = yield call(
      personaService.updatePersona,
      personaId,
      data
    );
    yield put(updatePersonaSuccess(updatedPersona));
  } catch (error) {
    yield put(updatePersonaFailure(error.response?.data || error.message));
  }
}

function* deletePersonaSaga(action) {
  try {
    const { workspaceId, objectiveId, personaId } = action.payload;
    yield call(personaService.deletePersona, workspaceId, objectiveId, personaId);
    yield put(deletePersonaSuccess(personaId));
  } catch (error) {
    yield put(deletePersonaFailure(error.response?.data || error.message));
  }
}

function* getPersonaPreviewSaga(action) {
  try {
    const { workspaceId, objectiveId, personaId } = action.payload;
    const preview = yield call(
      personaService.getPersonaPreview,
      workspaceId,
      objectiveId,
      personaId
    );
    yield put(getPersonaPreviewSuccess(preview));
  } catch (error) {
    yield put(getPersonaPreviewFailure(error.response?.data || error.message));
  }
}

export default function* personaSaga() {
  yield all([
    takeLatest(getPersonaTemplatesStart.type, getPersonaTemplatesSaga),
    takeLatest(createPersonaStart.type, createPersonaSaga),
    takeLatest(getPersonasStart.type, getPersonasSaga),
    takeLatest(getPersonaStart.type, getPersonaSaga),
    takeLatest(updatePersonaStart.type, updatePersonaSaga),
    takeLatest(deletePersonaStart.type, deletePersonaSaga),
    takeLatest(getPersonaPreviewStart.type, getPersonaPreviewSaga),
  ]);
}
