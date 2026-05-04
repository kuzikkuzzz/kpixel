/**
 * Main App
 */

import { Provider } from '../store/react-redux/index.js';
import { createRoot } from 'react-dom/client';

import Style from './Style.jsx';
import UIPopUp from './UIPopUp.jsx';
import MenuProvider from './menus/index.jsx';

const AppPopUp = () => (
  <>
    <Style />
    <MenuProvider>
      <UIPopUp />
    </MenuProvider>
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
