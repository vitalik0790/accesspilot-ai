export interface ElementInfo {
  tag: string;
  name: string;
  hasAlt?: boolean;
}
export interface PageStructureItem {
  kind: 'heading' | 'landmark' | 'link' | 'button' | 'form-label' | 'image';
  name: string;
}
export interface PageSnapshot {
  snapshotId: string;
  interactive: InteractiveElement[];
  title: string;
  text: string;
  truncated: boolean;
  structure: PageStructureItem[];
  images: ElementInfo[];
  buttons: ElementInfo[];
  fields: ElementInfo[];
}
export interface InteractiveElement {
  id: string;
  role: string;
  name: string;
  disabled: boolean;
}
export interface AIAnswer { answer: string; targetId?: string }
export interface FocusTarget { id: string; name: string; snapshotId: string }
export type FocusResponse = { ok: true } | { ok: false; error: string };
// Exists only in the extension's isolated world, never in a serialized snapshot.
export interface ElementRegistry {
  snapshotId: string;
  url: string;
  expiresAt: number;
  targets: Map<string, { element: HTMLElement; isCurrent: () => boolean }>;
}
declare global {
  interface Window { __accessPilotElements?: ElementRegistry }
}
export interface AccessibilityIssue {
  code: 'missing-alt' | 'unlabeled-button' | 'missing-label';
  message: string;
  element: string;
}
export type Request =
  | { type: 'focus'; snapshotId: string; targetId: string }
  | { type: 'scan' }
  | { type: 'summarize'; consent: true }
  | { type: 'ask'; question: string; consent: true };
export type Response =
  | { ok: true; title: string; issues: AccessibilityIssue[]; truncated: boolean; answer?: string; target?: FocusTarget }
  | { ok: false; error: string };
