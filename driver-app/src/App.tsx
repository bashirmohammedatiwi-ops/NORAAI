import { useEffect, useState } from 'react';
import { clearConfig, loadConfig, saveConfig, type DriverConfig } from './lib/storage';
import { fetchConfig } from './lib/api';
import SetupPage from './pages/SetupPage';
import DrivePage from './pages/DrivePage';

export default function App() {
  const [config, setConfig] = useState<DriverConfig | null>(() => loadConfig());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!config) return;
    fetchConfig(config)
      .then(() => { setReady(true); setError(''); })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Connection failed'); setReady(false); });
  }, [config]);

  const handleSave = async (c: DriverConfig) => {
    saveConfig(c);
    setConfig(c);
    await fetchConfig(c);
    setReady(true);
    setError('');
  };

  const handleLogout = () => {
    clearConfig();
    setConfig(null);
    setReady(false);
  };

  if (!config || !ready) {
    return <SetupPage initial={config} error={error} onSave={handleSave} />;
  }

  return <DrivePage config={config} onLogout={handleLogout} />;
}
