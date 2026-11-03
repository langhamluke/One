/**
 * Playbook: life-stage educational content (banking, credit, taxes, insurance, estate basics, tools).
 * Category-level guidance with sources; no brand endorsements. Filled in by the data pass.
 */
export type LifeStage = 'student' | 'first-job' | 'early-career' | 'growing' | 'all';

export interface PlaybookItem {
  text: string;
  source?: string;
  url?: string;
  asOf?: string;
  verified?: boolean;
}

export interface PlaybookTopic {
  key: string;
  title: string;
  stage: LifeStage;
  area: 'banking' | 'credit' | 'tax' | 'insurance' | 'investing' | 'education' | 'housing' | 'estate' | 'tools' | 'retirement';
  summary: string;
  items: PlaybookItem[];
  /** Rule the engine uses to surface this topic (documented, implemented in alerts/actions) */
  trigger?: string;
}

export const PLAYBOOK: PlaybookTopic[] = [];
