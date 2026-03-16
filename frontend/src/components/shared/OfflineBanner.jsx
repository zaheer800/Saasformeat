import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-white text-xs font-medium">
      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
      You're offline — check your connection
    </div>
  );
}
