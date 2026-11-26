import { create } from "zustand";

/** What the sync panel shows. Updated by `p2p.ts`. */
export interface P2pStatus {
  running: boolean;
  signaling: boolean; // reachable signaling server (finds other devices)
  peers: number; // devices connected directly (Wi-Fi / WebRTC)
  relay: boolean; // fallback relay connected
  relayRtt: number | null; // ms, measured to the relay only; direct links are not measured
  lastRemoteAt: number; // last time another device changed something here
  error: string;
}
export const useP2p = create<P2pStatus>(() => ({
  running: false,
  signaling: false,
  peers: 0,
  relay: false,
  relayRtt: null,
  lastRemoteAt: 0,
  error: "",
}));
