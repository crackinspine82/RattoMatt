/**
 * Mock: chapters and topics per subject. Replace with API.
 */

export type MicroTopic = {
  id: string;
  title: string;
};

export type Topic = {
  id: string;
  title: string;
  micro_topics?: MicroTopic[];
};

export type Chapter = {
  id: string;
  title: string;
  sequence_number?: number;
  discipline?: string | null;
  topics: Topic[];
};

const HIST_CIV_CHAPTERS: Chapter[] = [
  {
    id: 'ch1',
    title: 'The First War of Independence (1857)',
    sequence_number: 1,
    topics: [
      { id: 'ch1-t1', title: 'Causes of the revolt' },
      { id: 'ch1-t2', title: 'Spread and suppression' },
      { id: 'ch1-t3', title: 'Consequences' },
    ],
  },
  {
    id: 'ch2',
    title: 'Growth of Nationalism',
    sequence_number: 2,
    topics: [
      { id: 'ch2-t1', title: 'Early political associations' },
      { id: 'ch2-t2', title: 'Indian National Congress' },
      { id: 'ch2-t3', title: 'Partition of Bengal and Swadeshi' },
    ],
  },
  {
    id: 'ch3',
    title: 'The Indian National Movement (1919–1947)',
    sequence_number: 3,
    topics: [
      { id: 'ch3-t1', title: 'Non-Cooperation and Civil Disobedience' },
      { id: 'ch3-t2', title: 'Quit India Movement' },
      { id: 'ch3-t3', title: 'Towards Independence' },
    ],
  },
  {
    id: 'ch4',
    title: 'The Union Legislature',
    sequence_number: 4,
    topics: [
      { id: 'ch4-t1', title: 'Parliament: Lok Sabha and Rajya Sabha' },
      { id: 'ch4-t2', title: 'Legislative process' },
    ],
  },
  {
    id: 'ch5',
    title: 'The Union Executive',
    sequence_number: 5,
    topics: [
      { id: 'ch5-t1', title: 'President and Vice-President' },
      { id: 'ch5-t2', title: 'Prime Minister and Council of Ministers' },
    ],
  },
];

const DEFAULT_CHAPTERS: Chapter[] = [
  { id: 'ch1', title: 'Chapter 1', sequence_number: 1, topics: [{ id: 'ch1-t1', title: 'Topic 1.1' }, { id: 'ch1-t2', title: 'Topic 1.2' }] },
  { id: 'ch2', title: 'Chapter 2', sequence_number: 2, topics: [{ id: 'ch2-t1', title: 'Topic 2.1' }, { id: 'ch2-t2', title: 'Topic 2.2' }] },
  { id: 'ch3', title: 'Chapter 3', sequence_number: 3, topics: [{ id: 'ch3-t1', title: 'Topic 3.1' }] },
];

const SYLLABUS_BY_SUBJECT: Record<string, Chapter[]> = {
  'hist-civ': HIST_CIV_CHAPTERS,
};

export function getChaptersForSubject(subjectId: string): Chapter[] {
  return SYLLABUS_BY_SUBJECT[subjectId] ?? DEFAULT_CHAPTERS;
}
