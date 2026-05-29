import { Outlet } from 'react-router-dom';
import ToastViewport from './components/Toast/ToastViewport';
import WipBanner from './components/WipBanner/WipBanner';

export default function App() {
  return (
    <>
      <WipBanner />
      <Outlet />
      <ToastViewport />
    </>
  );
}
