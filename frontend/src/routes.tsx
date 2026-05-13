import { createBrowserRouter } from 'react-router-dom';

import App from './App';
import Title from './pages/Title';
import RunList from './pages/RunList';
import NewRun from './pages/NewRun';
import Game from './pages/Game';
import EndScreen from './pages/EndScreen';
import About from './pages/About';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Title /> },
      { path: 'runs', element: <RunList /> },
      { path: 'runs/new', element: <NewRun /> },
      { path: 'runs/:runId', element: <Game /> },
      { path: 'runs/:runId/end', element: <EndScreen /> },
      { path: 'about', element: <About /> },
    ],
  },
]);
