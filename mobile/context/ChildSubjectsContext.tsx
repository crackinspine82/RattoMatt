import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = '@rattomatt/child_subjects';

export type ChildSubjectsState = {
  selectedSubjectIds: string[];
  board: string;
  grade: string;
  studentName: string;
};

const DEFAULT_STATE: ChildSubjectsState = {
  selectedSubjectIds: [],
  board: 'ICSE',
  grade: 'Grade 9',
  studentName: 'Arjun',
};

type ChildSubjectsContextValue = ChildSubjectsState & {
  setSelectedSubjectIds: (ids: string[]) => void;
  setBoard: (board: string) => void;
  setGrade: (grade: string) => void;
  setStudentName: (name: string) => void;
  setChildSubjects: (state: Partial<ChildSubjectsState>) => void;
  addSubject: (id: string) => void;
  removeSubject: (id: string) => void;
  isLoading: boolean;
};

const ChildSubjectsContext = createContext<ChildSubjectsContextValue | null>(null);

export function ChildSubjectsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ChildSubjectsState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChildSubjectsState;
        setState({
          selectedSubjectIds: parsed.selectedSubjectIds ?? [],
          board: parsed.board ?? DEFAULT_STATE.board,
          grade: parsed.grade ?? DEFAULT_STATE.grade,
          studentName: parsed.studentName ?? DEFAULT_STATE.studentName,
        });
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(async (next: ChildSubjectsState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const setSelectedSubjectIds = useCallback(
    (ids: string[]) => {
      setState((prev) => {
        const next = { ...prev, selectedSubjectIds: ids };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setBoard = useCallback(
    (board: string) => {
      setState((prev) => {
        const next = { ...prev, board };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setGrade = useCallback(
    (grade: string) => {
      setState((prev) => {
        const next = { ...prev, grade };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setStudentName = useCallback(
    (studentName: string) => {
      setState((prev) => {
        const next = { ...prev, studentName };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setChildSubjects = useCallback(
    (partial: Partial<ChildSubjectsState>) => {
      setState((prev) => {
        const next = { ...prev, ...partial };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const addSubject = useCallback(
    (id: string) => {
      setState((prev) => {
        if (prev.selectedSubjectIds.includes(id)) return prev;
        const next = { ...prev, selectedSubjectIds: [...prev.selectedSubjectIds, id] };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeSubject = useCallback(
    (id: string) => {
      setState((prev) => {
        const next = { ...prev, selectedSubjectIds: prev.selectedSubjectIds.filter((x) => x !== id) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value: ChildSubjectsContextValue = {
    ...state,
    setSelectedSubjectIds,
    setBoard,
    setGrade,
    setStudentName,
    setChildSubjects,
    addSubject,
    removeSubject,
    isLoading,
  };

  return <ChildSubjectsContext.Provider value={value}>{children}</ChildSubjectsContext.Provider>;
}

export function useChildSubjects(): ChildSubjectsContextValue {
  const ctx = useContext(ChildSubjectsContext);
  if (!ctx) {
    throw new Error('useChildSubjects must be used within ChildSubjectsProvider');
  }
  return ctx;
}
