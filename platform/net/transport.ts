export type PeerId = string;

export type TransportStatus =
  'searching' | 'connecting' | 'connected' | 'failed-room' | 'failed-nat' | 'closed';

export type IcePathKind = 'direct' | 'relay' | 'unknown';

/**
 * Transport abstraction so game/room logic is independent of WebRTC,
 * BroadcastChannel, or in-memory test harnesses.
 */
export interface Transport<Message = unknown> {
  readonly selfId: PeerId;
  send(to: PeerId | 'all', data: Message): void;
  onMessage(cb: (from: PeerId, data: Message) => void): () => void;
  onPeerJoin(cb: (peer: PeerId) => void): () => void;
  onPeerLeave(cb: (peer: PeerId) => void): () => void;
  onStatus?(cb: (status: TransportStatus, path?: IcePathKind) => void): () => void;
  close(): Promise<void>;
}
