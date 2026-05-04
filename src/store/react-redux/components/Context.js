import { React } from '../utils/react.js';

const ContextKey = /* @__PURE__ */ Symbol.for(`react-redux-context`);
const gT = (
  typeof globalThis !== 'undefined'
    ? globalThis
    : /* per-module scope if `globalThis` is not available */ {}
);

function getContext() {
  if (!React.createContext) return {};

  const contextMap = (gT[ContextKey] ??= new Map());
  let realContext = contextMap.get(React.createContext);
  if (!realContext) {
    realContext = React.createContext(null);
    if (process.env.NODE_ENV !== 'production') {
      realContext.displayName = 'ReactRedux';
    }
    contextMap.set(React.createContext, realContext);
  }
  return realContext;
}

export const ReactReduxContext = /* #__PURE__ */ getContext();
