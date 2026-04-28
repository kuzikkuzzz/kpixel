/**
 * Main App
 */

import { Provider } from 'react-redux';
import { createRoot } from 'react-dom/client';
import { IconContext } from 'react-icons';

import Style from './Style.jsx';
import UIPopUp from './UIPopUp.jsx';
import MenuProvider from './menus/index.jsx';

const iconContextValue = { style: { verticalAlign: 'middle' } };

const AppPopUp = () => (
  <>
    <Style />
    <IconContext.Provider value={iconContextValue}>
      <MenuProvider>
        <UIPopUp />
      </MenuProvider>
    </IconContext.Provider>
  </>
);

function renderAppPopUp(domParent, store) {
  const root = createRoot(domParent);
  root.render(
    <Provider store={store}>
      <AppPopUp />
    </Provider>,
  );
}

export default renderAppPopUp;
