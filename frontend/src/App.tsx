import { Outlet } from 'react-router-dom';
import ToastViewport from './components/Toast/ToastViewport';

export default function App() {
  return (
    <>
      <Outlet />
      <ToastViewport />
    </>
  );
}
