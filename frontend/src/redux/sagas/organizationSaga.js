import { call, put, takeLatest } from 'redux-saga/effects';
import { organizationService } from '../../services/organizationService';
import {
  fetchOrganizationsStart,
  fetchOrganizationsSuccess,
  fetchOrganizationsFailure,
} from '../slices/orgSlice';

function* fetchOrganizationsSaga() {
  try {
    const organizations = yield call(organizationService.getOrganizations);
    yield put(fetchOrganizationsSuccess(organizations));
  } catch (error) {
    yield put(fetchOrganizationsFailure(error.message || 'Failed to fetch organizations'));
  }
}

export function* watchFetchOrganizations() {
  yield takeLatest(fetchOrganizationsStart.type, fetchOrganizationsSaga);
}

export default function* organizationSaga() {
  yield watchFetchOrganizations();
}