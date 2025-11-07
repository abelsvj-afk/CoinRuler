"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export function WelcomeModal() {
  const { data } = useSession();
  const user = data?.user as any;
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    // Show once per session unless user opted out permanently
    const optOut = localStorage.getItem("coinruler.welcome.optOut") === "1";
    const shownThisSession = sessionStorage.getItem("coinruler.welcome.shown") === "1";
    
    if (!optOut && !shownThisSession && data) {
      setOpen(true);
      sessionStorage.setItem("coinruler.welcome.shown", "1");
    }
  }, [data]);

  const close = () => {
    if (dontShow) localStorage.setItem("coinruler.welcome.optOut", "1");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="glass-strong max-w-lg w-full mx-4 rounded-2xl p-6 border border-white/10">
        <div className="text-sm text-white/60 mb-2">Welcome back</div>
        <h2 className="text-2xl font-bold mb-2">Hey {user?.name || 'Owner'}, I’m your CoinRuler assistant 👋</h2>
        <p className="text-white/70 mb-4">
          I’ll watch your BTC/XRP baselines, auto-execute core rules, queue approvals for anything risky,
          and alert you on performance or risk issues. Want a quick tour?
        </p>
        <ul className="list-disc pl-5 text-white/70 space-y-1 mb-4">
          <li>Dashboard: Live portfolio, approvals, alerts</li>
          <li>Approvals: Review/approve trades for non-core assets</li>
          <li>Alerts: Risk, performance, and optimizer suggestions</li>
          <li>Commands: One-click actions and simulations</li>
        </ul>
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} />
            Don’t show next time
          </label>
          <div className="flex gap-2">
            <a href="/commands" className="inline-flex"><Button variant="secondary" size="sm">View Commands</Button></a>
            <Button variant="primary" size="sm" onClick={close}>Let’s go</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
