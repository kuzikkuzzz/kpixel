/**
 * Main App
 */

import { Provider } from '../store/react-redux/index.js';
import { createRoot } from 'react-dom/client';

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
  const root = createRoot(domParent);
  root.render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

export default renderApp;
