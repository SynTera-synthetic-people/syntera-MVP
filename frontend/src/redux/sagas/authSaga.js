import { call, put, takeLatest } from 'redux-saga/effects';
import { authService } from '../../services/authService';
import { loginStart, loginSuccess, loginFailure } from '../slices/authSlice';
import { setAuthToken } from '../../utils/axiosConfig';

function* loginSaga(action) {
  try {
    const { email, password } = action.payload;

    const response = yield call(authService.login, { email, password });

    const { data } = response;
    const user = {
      user_id: data.user_id,
      full_name: data.full_name,
      email: data.email,
      role: data.role,
      user_type: data.user_type,
      organization_id: data.organization_id,
      org_id: data.org_id,
    };
    const token = data.access_token;

    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));

    setAuthToken(token);

    yield put(loginSuccess({ user, token }));

  } catch (error) {
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