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
  title: string;
  text: string;
  truncated: boolean;
  structure: PageStructureItem[];
  images: ElementInfo[];
  buttons: ElementInfo[];
  fields: ElementInfo[];
}
export interface AccessibilityIssue {
  code: 'missing-alt' | 'unlabeled-button' | 'missing-label';
  message: string;
  element: string;
}
export type Request =
  | { type: 'scan' }
  | { type: 'summarize'; consent: true }
  | { type: 'ask'; question: string; consent: true };
export type Response =
  | { ok: true; title: string; issues: AccessibilityIssue[]; truncated: boolean; answer?: string }
  | { ok: false; error: string };
