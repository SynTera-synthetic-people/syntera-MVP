// src/redux/sagas/omiSaga.js
import { call, put, takeLatest } from 'redux-saga/effects';
import omiService from '../../services/omiService';
import {
  initializeSessionStart,
  initializeSessionSuccess,
  initializeSessionFailure,
  sendMessageStart,
  sendMessageSuccess,
  sendMessageFailure,
  endSessionStart,
  endSessionSuccess,
  endSessionFailure,
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
} from '../slices/omiSlice';


function* initializeSessionSaga(action) {
  try {
    const { orgId } = action.payload;
    const response = yield call(omiService.initializeSession, orgId);
    yield put(initializeSessionSuccess(response));
  } catch (error) {
    yield put(initializeSessionFailure(error.message || 'Failed to initialize Omi session'));
  }
}


function* sendMessageSaga(action) {
  try {
    const { orgId, sessionId, message, context } = action.payload;
    const response = yield call(omiService.sendMessage, orgId, sessionId, message, context);
    yield put(sendMessageSuccess(response));
  } catch (error) {
    yield put(sendMessageFailure(error.message || 'Failed to send message'));
  }
}

function* chatWithOmiSaga(action) {
  try {
    const { orgId, message, context } = action.payload;
    const response = yield call(omiService.chatWithOmi, orgId, message, context);
    // Extract the data object which contains the actual response text
    yield put(chatWithOmiSuccess(response.data));
  } catch (error) {
    yield put(chatWithOmiFailure(error.message || 'Failed to send message to Omi'));
  }
}

function* getGuidanceSaga(action) {
  try {
    const { orgId, stage, userInput } = action.payload;
    const response = yield call(omiService.getGuidance, orgId, stage, userInput);
    // Response structure: { status, message, data: { ... } }
    yield put(getGuidanceSuccess(response.data));
  } catch (error) {
    yield put(getGuidanceFailure(error.message || 'Failed to get guidance'));
  }
}

function* validateSaga(action) {
  try {
    const { orgId, stage, data } = action.payload;
    const response = yield call(omiService.validate, orgId, stage, data);
    yield put(validateSuccess(response.data));
  } catch (error) {
    yield put(validateFailure(error.message || 'Failed to validate data'));
  }
}

function* updateStateSaga(action) {
  try {
    const { orgId, data } = action.payload;
    const response = yield call(omiService.updateState, orgId, data);
    yield put(updateStateSuccess(response));
  } catch (error) {
    yield put(updateStateFailure(error.message || 'Failed to update state'));
  }
}


function* endSessionSaga(action) {
  try {
    const { orgId, sessionId } = action.payload;
    yield call(omiService.endSession, orgId, sessionId);
    yield put(endSessionSuccess());
  } catch (error) {
    yield put(endSessionFailure(error.message || 'Failed to end session'));
  }
}


export default function* omiSaga() {
  yield takeLatest(initializeSessionStart.type, initializeSessionSaga);
  yield takeLatest(sendMessageStart.type, sendMessageSaga);
  yield takeLatest(endSessionStart.type, endSessionSaga);
  yield takeLatest(chatWithOmiStart.type, chatWithOmiSaga);
  yield takeLatest(getGuidanceStart.type, getGuidanceSaga);
  yield takeLatest(validateStart.type, validateSaga);
  yield takeLatest(updateStateStart.type, updateStateSaga);
}
