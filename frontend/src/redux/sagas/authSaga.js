import { call, put, takeLatest } from 'redux-saga/effects';
import { authService } from '../../services/authService';
import { loginStart, loginSuccess, loginFailure } from '../slices/authSlice';
import { setAuthToken } from '../../utils/axiosConfig';
import { buildAuthUser } from '../../utils/authRouting';

function* loginSaga(action) {
  try {
    const { email, password } = action.payload;

    const response = yield call(authService.login, { email, password });
    const token = response?.data?.access_token;

    if (!token) {
      throw new Error('Login token missing from response');
    }

    localStorage.setItem('token', token);
    setAuthToken(token);

    const meResponse = yield call(authService.fetchMe);
    const user = buildAuthUser(meResponse?.data || {});

    localStorage.setItem('user', JSON.stringify(user));

    yield put(loginSuccess({ user, token }));

  } catch (error) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthToken(null);
    const errorMessage = error.message || 'Login failed';
    yield put(loginFailure(errorMessage));
  }
}

export function* watchLogin() {
  yield takeLatest(loginStart.type, loginSaga);
}

export default function* authSaga() {
  yield watchLogin();
}
