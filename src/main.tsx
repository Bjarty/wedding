import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import InvitationPreview from './components/InvitationPreview.tsx';
import './index.css';

const searchParameters = new URLSearchParams(window.location.search);
const showLocalInvitationPreview =
  import.meta.env.DEV && searchParameters.get('preview') === 'invitation';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showLocalInvitationPreview ? <InvitationPreview /> : <App />}
  </StrictMode>,
);
