export interface NavItem {
  path: string;
  label: string;
  title: string;
  description: string;
  // Shown directly in the mobile bottom bar; the rest live behind the menu.
  primary: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Dashboard', title: 'Dashboard', description: 'Your tasks, sessions, and progress at a glance.', primary: true },
  { path: '/tasks', label: 'Tasks', title: 'Tasks', description: 'Create, organize, and complete your study tasks.', primary: true },
  { path: '/materials', label: 'Materials', title: 'Materials', description: 'Upload study materials and get summaries.', primary: true },
  { path: '/assistant', label: 'Assistant', title: 'AI Assistant', description: 'Ask questions and get study help.', primary: true },
  { path: '/quiz', label: 'Quiz', title: 'Quiz', description: 'Test yourself with generated quizzes.', primary: false },
  { path: '/planner', label: 'Planner', title: 'Study Planner', description: 'Schedule your study sessions.', primary: false },
  { path: '/analytics', label: 'Analytics', title: 'Analytics', description: 'See how your studying is going.', primary: false },
  { path: '/settings', label: 'Settings', title: 'Settings', description: 'Preferences and account options.', primary: false },
];

export const APP_NAME = 'LearnFlow';

export function titleForPath(pathname: string): string | undefined {
  return NAV_ITEMS.find((item) => item.path === pathname)?.title;
}
