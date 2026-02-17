import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./slices/userSlice";
import authReducer from "./slices/authSlice";
import orgReducer from "./slices/orgSlice";
import researchObjectiveReducer from "./slices/researchObjectiveSlice";
import personaReducer from "./slices/personaSlice";
import omiReducer from "./slices/omiSlice";
import createSagaMiddleware from "redux-saga";
import rootSaga from "./sagas/rootSaga";

const sagaMiddleware = createSagaMiddleware();

export const store = configureStore({
  reducer: {
    user: userReducer,
    auth: authReducer,
    organizations: orgReducer,
    researchObjective: researchObjectiveReducer,
    persona: personaReducer,
    omi: omiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(sagaMiddleware),
});

sagaMiddleware.run(rootSaga);
