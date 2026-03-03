import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = '@rattomatt/subject_config';

export type SubjectSelection = {
  chapterIds: string[];
  topicIds: string[];
  microTopicIds: string[];
};

type StoredConfig = Record<string, SubjectSelection>;

type SubjectConfigContextValue = {
  getConfig: (subjectId: string) => SubjectSelection | undefined;
  setConfig: (subjectId: string, selection: SubjectSelection) => void;
  clearConfig: (subjectId: string) => void;
};

const SubjectConfigContext = createContext<SubjectConfigContextValue | null>(null);

export function SubjectConfigProvider({ children }: { children: React.ReactNode }) {
  const [configBySubject, setConfigBySubject] = useState<StoredConfig>({});

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredConfig;
        setConfigBySubject(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(async (next: StoredConfig) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const getConfig = useCallback(
    (subjectId: string): SubjectSelection | undefined => configBySubject[subjectId],
    [configBySubject]
  );

  const setConfig = useCallback(
    (subjectId: string, selection: SubjectSelection) => {
      setConfigBySubject((prev) => {
        const next = { ...prev, [subjectId]: selection };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearConfig = useCallback(
    (subjectId: string) => {
      setConfigBySubject((prev) => {
        const next = { ...prev };
        delete next[subjectId];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value: SubjectConfigContextValue = { getConfig, setConfig, clearConfig };

  return (
    <SubjectConfigContext.Provider value={value}>
      {children}
    </SubjectConfigContext.Provider>
  );
}

export function useSubjectConfig(): SubjectConfigContextValue {
  const ctx = useContext(SubjectConfigContext);
  if (!ctx) {
    throw new Error('useSubjectConfig must be used within SubjectConfigProvider');
  }
  return ctx;
}
