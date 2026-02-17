import { all } from 'redux-saga/effects';
import organizationSaga from './organizationSaga';
import authSaga from './authSaga';
import researchObjectiveSaga from './researchObjectiveSaga';
import personaSaga from './personaSaga';
import omiSaga from './omiSaga';

export default function* rootSaga() {
  yield all([
    organizationSaga(),
    authSaga(),
    researchObjectiveSaga(),
    personaSaga(),
    omiSaga(),
  ]);
}