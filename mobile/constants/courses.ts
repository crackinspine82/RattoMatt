/**
 * Mock: all courses by board/grade. Replace with API.
 */
export type Course = {
  id: string;
  title: string;
  board: string;
  grade: string;
  author: string;
  description: string;
  image: number;
};

export const ALL_COURSES: Course[] = [
  // ICSE Grade 9 (default board/grade in app)
  { id: 'hist-civ-9', title: 'History & Civics', board: 'ICSE', grade: 'Grade 9', author: 'Morning Star', description: 'Total History & Civics – Class 9.', image: require('@/assets/images/icon.png') },
  { id: 'geo-9', title: 'Geography', board: 'ICSE', grade: 'Grade 9', author: 'Jasmine Rachel', description: 'Total Geography – maps and concepts.', image: require('@/assets/images/icon.png') },
  { id: 'hist-civ', title: 'History & Civics', board: 'ICSE', grade: 'Grade 10', author: 'Dolly Sequeira', description: 'Total History & Civics – full syllabus.', image: require('@/assets/images/icon.png') },
  { id: 'geo', title: 'Geography', board: 'ICSE', grade: 'Grade 10', author: 'Dolly Sequeira', description: 'Total Geography – maps and concepts.', image: require('@/assets/images/icon.png') },
  { id: 'bio', title: 'Biology', board: 'ICSE', grade: 'Grade 10', author: 'Sarina Singh', description: 'Concise Biology – ICSE Class 10.', image: require('@/assets/images/icon.png') },
  { id: 'bio-alt', title: 'Biology', board: 'ICSE', grade: 'Grade 10', author: 'Selina', description: 'Concise Biology – alternate textbook.', image: require('@/assets/images/icon.png') },
  { id: 'eng-lang', title: 'English Language', board: 'ICSE', grade: 'Grade 10', author: 'Pearson', description: 'English Language – grammar and writing.', image: require('@/assets/images/icon.png') },
  { id: 'eng-lit', title: 'English Literature', board: 'ICSE', grade: 'Grade 10', author: 'Pearson', description: 'English Literature – prose and poetry.', image: require('@/assets/images/icon.png') },
  { id: 'hist-cbse', title: 'History', board: 'CBSE', grade: 'Grade 10', author: 'NCERT', description: 'India and the Contemporary World.', image: require('@/assets/images/icon.png') },
  { id: 'geo-cbse', title: 'Geography', board: 'CBSE', grade: 'Grade 10', author: 'NCERT', description: 'Contemporary India.', image: require('@/assets/images/icon.png') },
];

/** Normalize grade for comparison: "9", "grade 9", "Grade 9" → "Grade 9". */
function normalizeGrade(grade: string): string {
  const num = grade.replace(/\D/g, '').trim();
  if (num) return `Grade ${num}`;
  return grade.trim() || grade;
}

export function getCoursesForBoardGrade(board: string, grade: string): Course[] {
  const b = (board || '').trim();
  const g = normalizeGrade(grade || '');
  return ALL_COURSES.filter((c) => c.board === b && normalizeGrade(c.grade) === g);
}
