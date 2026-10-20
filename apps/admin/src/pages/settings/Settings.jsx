import { useState } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { useTitle } from '@equipment-hire/client/ui';
import PageHeader from '../../components/PageHeader.jsx';
import GeneralSettings from './GeneralSettings.jsx';
import CancellationPolicy from './CancellationPolicy.jsx';
import AutoApproval from './AutoApproval.jsx';
import TermsVersions from './TermsVersions.jsx';
import EmailTemplates from './EmailTemplates.jsx';

export default function Settings() {
  useTitle('Settings', 'Admin');
  const { can } = useAuth();
  const tabs = [
    ['general', 'General', GeneralSettings, 'settings.view'],
    ['cancellation', 'Cancellation policy', CancellationPolicy, 'settings.view'],
    ['approval', 'Auto-approval', AutoApproval, 'settings.view'],
    ['terms', 'Terms of hire', TermsVersions, 'settings.view'],
    ['emails', 'Email templates', EmailTemplates, 'email.manage'],
  ].filter(([, , , p]) => can(p));
  const [tab, setTab] = useState(tabs[0]?.[0]);
  const Active = tabs.find((t) => t[0] === tab)?.[2];
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Everything customers see and every policy the system applies"
      />
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {Active && <Active />}
    </>
  );
}
