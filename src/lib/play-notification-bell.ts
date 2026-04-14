/**
 * Chuông ngắn (Web Audio) — không cần file âm thanh.
 * Trả về Promise khi tiếng đã tắt (để gọi seek + bật lại YouTube).
 */
export function playNotificationBell(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return Promise.resolve();

  const ctx = new Ctx();
  const start = () => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(523.25, t0 + 0.12);
    gain.gain.setValueAtTime(0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
    osc.start(t0);
    osc.stop(t0 + 0.56);
  };

  return ctx
    .resume()
    .then(() => {
      start();
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          ctx.close().catch(() => {});
          resolve();
        }, 650);
      });
    })
    .catch(() => {
      ctx.close().catch(() => {});
    });
}
