import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { Bootstrap, Recent } from "./types";

// Fixed-size snapshots only. Credentials, QR tokens and photos never enter Redux.
export const scannerSlice = createSlice({
  name: "scanner",
  initialState: { bootstrap: null as Bootstrap | null, recent: [] as Recent[] },
  reducers: {
    setBootstrap(state, action: PayloadAction<Bootstrap | null>) {
      state.bootstrap = action.payload;
    },
    setRecent(state, action: PayloadAction<Recent[]>) {
      state.recent = [
        ...new Map(action.payload.map((row) => [row.id, row])).values(),
      ].slice(0, 10);
    },
    clear() {
      return { bootstrap: null, recent: [] };
    },
  },
});
export const store = configureStore({
  reducer: { scanner: scannerSlice.reducer },
  devTools: false,
});
export type RootState = ReturnType<typeof store.getState>;
export const { setBootstrap, setRecent, clear } = scannerSlice.actions;
