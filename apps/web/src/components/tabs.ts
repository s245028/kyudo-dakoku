export const TABS = {
  scan: {
    label: '打刻',
    icon: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 9h2v2H9zM13 13h2v2h-2zM13 9h2v2M9 13v2h2',
  },
  presence: {
    label: '在室',
    icon: 'M5.8 8a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M14.6 9a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0M15.5 14.4c2.3-.3 4.4 1.2 5 4.1',
  },
  penalty: {
    label: '罰',
    icon: 'M6 3.5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM8 8h8M8 12h8M8 16h5',
  },
  me: {
    label: '自分',
    icon: 'M8.4 8a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0-7.2 0M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6',
  },
  admin: {
    label: '役職',
    icon: 'M4 7h10M18 7h2M4 12h2M10 12h10M4 17h8M16 17h4M14 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  },
} as const;

export type TabId = keyof typeof TABS;
