/**
 * Main App
 */
if (process.env.NODE_ENV === 'development') {
  // Must use require here as import statements are only allowed
  // to exist at top-level.
  require('preact/debug');
}

import { Provider } from '../store/react-redux/index.js';
import { render } from 'preact';

import Style from './Style.jsx';
import CoordinatesBox from './CoordinatesBox.jsx';
import OnlineBox from './OnlineBox.jsx';
import ChatButton from './buttons/ChatButton.jsx';
import MenuButton from './buttons/MenuButton.jsx';
import UI from './UI.jsx';
import WindowManager from './WindowManager.jsx';
import MenuProvider from './menus/index.jsx';

const App = () => (
  <>
    <Style />
    <MenuProvider>
      <ChatButton />
      <OnlineBox />
      <CoordinatesBox />
      <MenuButton />
      <UI />
      <WindowManager />
    </MenuProvider>
  </>
);

function renderApp(domParent, store) {
  render(
    <Provider store={store}>
      <App />
    </Provider>,
    domParent,
  );
}

export default renderApp;
