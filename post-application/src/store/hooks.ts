import { useDispatch, useSelector } from 'react-redux';

import type { AppDispatch, RootState } from '.';

/**
 * Pre-typed versions of the react-redux hooks, so no call site has to annotate
 * `RootState` by hand or reach for `any` on a thunk dispatch.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
