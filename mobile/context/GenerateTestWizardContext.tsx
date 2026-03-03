import React, { createContext, useCallback, useContext, useState } from 'react';

import type { Course } from '@/constants/courses';

export type TestType = 'single_chapter' | 'multi_chapter' | 'term' | 'full_syllabus';

export type WizardState = {
  subjectId: string | null;
  subject: Course | null;
  selectedChapterIds: string[];
  selectedTopicIds: string[];
  selectedMicroTopicIds: string[];
  testType: TestType | null;
};

const DEFAULT_STATE: WizardState = {
  subjectId: null,
  subject: null,
  selectedChapterIds: [],
  selectedTopicIds: [],
  selectedMicroTopicIds: [],
  testType: null,
};

type WizardContextValue = WizardState & {
  setSubject: (subject: Course | null) => void;
  setChapterTopicSelection: (chapterIds: string[], topicIds: string[]) => void;
  setChapterTopicMicroSelection: (chapterIds: string[], topicIds: string[], microTopicIds: string[]) => void;
  setTestType: (type: TestType | null) => void;
  reset: () => void;
};

const GenerateTestWizardContext = createContext<WizardContextValue | null>(null);

export function GenerateTestWizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);

  const setSubject = useCallback((subject: Course | null) => {
    setState((prev) => ({
      ...prev,
      subjectId: subject?.id ?? null,
      subject,
      selectedChapterIds: [],
      selectedTopicIds: [],
      selectedMicroTopicIds: [],
      testType: null,
    }));
  }, []);

  const setChapterTopicSelection = useCallback((chapterIds: string[], topicIds: string[]) => {
    setState((prev) => ({ ...prev, selectedChapterIds: chapterIds, selectedTopicIds: topicIds }));
  }, []);

  const setChapterTopicMicroSelection = useCallback((chapterIds: string[], topicIds: string[], microTopicIds: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedChapterIds: chapterIds,
      selectedTopicIds: topicIds,
      selectedMicroTopicIds: microTopicIds,
    }));
  }, []);

  const setTestType = useCallback((testType: TestType | null) => {
    setState((prev) => ({ ...prev, testType }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const value: WizardContextValue = {
    ...state,
    setSubject,
    setChapterTopicSelection,
    setChapterTopicMicroSelection,
    setTestType,
    reset,
  };

  return (
    <GenerateTestWizardContext.Provider value={value}>
      {children}
    </GenerateTestWizardContext.Provider>
  );
}

export function useGenerateTestWizard(): WizardContextValue {
  const ctx = useContext(GenerateTestWizardContext);
  if (!ctx) {
    throw new Error('useGenerateTestWizard must be used within GenerateTestWizardProvider');
  }
  return ctx;
}
