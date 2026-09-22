import { CheckCircle2, Download, Share } from 'lucide-react';
import { useInstall } from '../lib/pwa';
import { APP_NAME } from '../lib/supabase';

/** "Add to Home Screen" button (Android/Chrome) or the matching instructions for iPhone and other browsers. */
export default function InstallPrompt() {
  const { canInstall, installed, install, showIosHint } = useInstall();

  if (installed) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-[15px] text-brand-800">
        <CheckCircle2 size={22} className="shrink-0" /> {APP_NAME} is installed on this device.
      </div>
    );
  }
  if (canInstall) {
    return (
      <button className="btn-primary w-full" onClick={install}>
        <Download size={20} /> Install {APP_NAME} on this device
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-stone-100 px-4 py-3 text-[15px] leading-snug text-stone-700">
      {showIosHint ? (
        <>On iPhone: tap <Share size={16} className="mx-0.5 inline align-text-bottom" /> <b>Share</b>, then <b>Add to Home Screen</b>.</>
      ) : (
        <>To install: open the browser menu (three dots) and tap <b>Install app</b> or <b>Add to Home screen</b>. This only appears on the live https site.</>
      )}
    </div>
  );
}
