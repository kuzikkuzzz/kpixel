/**
 * Main App
 */

import { Provider } from '../store/react-redux/index.js';
import { createRoot } from 'react-dom/client';
import { IconContext } from 'react-icons';

import Style from './Style.jsx';
import CoordinatesBox from './CoordinatesBox.jsx';
import OnlineBox from './OnlineBox.jsx';
import ChatButton from './buttons/ChatButton.jsx';
import MenuButton from './buttons/MenuButton.jsx';
import UI from './UI.jsx';
import WindowManager from './WindowManager.jsx';
import MenuProvider from './menus/index.jsx';

const iconContextValue = { style: { verticalAlign: 'middle' } };

const App = () => (
  <>
    <Style />
    <IconContext.Provider value={iconContextValue}>
      <MenuProvider>
        <ChatButton />
        <OnlineBox />
        <CoordinatesBox />
        <MenuButton />
        <UI />
        <WindowManager />
      </MenuProvider>
    </IconContext.Provider>
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
