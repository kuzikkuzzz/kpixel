import { React } from '../utils/react.js';
import { ReactReduxContext } from '../components/Context.js';

/**
 * Hook factory, which creates a `useReduxContext` hook bound to a given
 * context. This is a low-level hook that you should usually not need to call
 * directly.
 *
 * @param {React.Context} Context passed to your `<Provider>`.
 * @returns {Function} A `useReduxContext` hook bound to the specified context.
 */
export function createReduxContextHook(context = ReactReduxContext) {
  return function useReduxContext() {
    const contextValue = React.useContext(context);

    if (process.env.NODE_ENV !== 'production' && !contextValue) {
      throw new Error(
        // eslint-disable-next-line max-len
        'could not find react-redux context value; please ensure the component is wrapped in a <Provider>',
      );
    }

    return contextValue;
  };
}

/**
 * A hook to access the value of the `ReactReduxContext`. This is a low-level
 * hook that you should usually not need to call directly.
 *
 * @returns {any} the value of the `ReactReduxContext`
 *
 * @example
 *
 * import React from 'react'
 * import { useReduxContext } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const { store } = useReduxContext()
 *   return <div>{store.getState()}</div>
 * }
 */
export const useReduxContext = /* #__PURE__ */ createReduxContextHook();
