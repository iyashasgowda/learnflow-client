export const API_PREFIX = '/api';
export const THEME_STORAGE_KEY = 'learnflow.theme.v1';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
export const MAIN_CONTENT_ID = 'main-content';
export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'LearnFlow';
export const UNSAFE_METHODS: readonly string[] = ['POST', 'PUT', 'PATCH', 'DELETE'];
export const HTTP_NO_CONTENT = 204;

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_TOKEN: 'INVALID_TOKEN',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  UPLOAD_IN_PROGRESS: 'UPLOAD_IN_PROGRESS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  AI_AUTH_FAILED: 'AI_AUTH_FAILED',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  AI_BUDGET_PAUSED: 'AI_BUDGET_PAUSED',
  CONVERSATION_FULL: 'CONVERSATION_FULL',
  DOCUMENT_TOO_LARGE: 'DOCUMENT_TOO_LARGE',
  ATTEMPT_LOCKED: 'ATTEMPT_LOCKED',
} as const;

// A failed send cannot be fixed by sending the same message again.
export const NOT_RETRYABLE_CODES: readonly string[] = [
  ERROR_CODES.AI_NOT_CONFIGURED,
  ERROR_CODES.AI_AUTH_FAILED,
  ERROR_CODES.AI_QUOTA_EXCEEDED,
  ERROR_CODES.AI_BUDGET_PAUSED,
  ERROR_CODES.CONVERSATION_FULL,
  ERROR_CODES.EMAIL_NOT_VERIFIED,
  ERROR_CODES.VALIDATION_ERROR,
];

export const CHAT_LIMITS = { messageMax: 4000, titleMax: 120, counterFrom: 3500 } as const;
export const HEALTH_STALE_MS = 60_000;

export const PASSWORD_RULES = { min: 10, max: 128 } as const;
export const TASK_LIMITS = { title: 200, description: 2000, pageSize: 10 } as const;

export const MATERIAL_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'] as const;
export const MATERIAL_ACCEPT = MATERIAL_EXTENSIONS.join(',');
export const MATERIAL_FORMATS_TEXT = MATERIAL_EXTENSIONS.join(', ');
export const MATERIAL_UPLOAD_FIELD = 'file';
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
export const HTTP_SERVER_ERROR_FROM = 500;
export const PERCENT = 100;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SECONDS_PER_MINUTE = 60;

export const MESSAGES = {
  unexpectedResponse: 'The server sent an unexpected response. Please try again.',
  network: 'Cannot reach the server. Check that it is running, then retry.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  generic: 'Something went wrong. Please try again.',
  invalidLink: 'This link is invalid or has expired.',
} as const;

export const HTTP_NOT_FOUND = 404;

export const LEGAL_PATHS = { terms: '/terms', privacy: '/privacy' } as const;
export const CONSENT_MESSAGES = { required: 'Accept the Terms of Service and the Privacy Policy to create an account.' } as const;
export const AI_DISCLOSURE_MESSAGES = {
  heading: 'Before you use the AI features',
  body: 'The assistant, summaries and quizzes are written by a third-party AI provider. To do that, the text you send is sent to the provider: your chat messages, the text of the documents you summarize or make quizzes from, and your short answers when you ask for a review.',
  more: 'Read how your data is handled in the Privacy Policy',
  acknowledge: 'I understand, continue',
  acknowledging: 'Saving…',
} as const;

export const PLANNER_LIMITS = { titleMax: 200, maxMs: 12 * 3_600_000, defaultStart: '09:00', defaultEnd: '10:00', agendaLimit: 200 } as const;
export const DASHBOARD_LIMITS = { upcomingSessions: 5, upcomingDays: 14, recentActivity: 8 } as const;
export const ANALYTICS_RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
] as const;

export const SUMMARY_MESSAGES = {
  loading: 'Loading summary…',
  loadFailed: 'The summary could not be loaded.',
  none: 'No summary yet.',
  generating: 'Reading the document and writing the summary. A long document can take a minute or more.',
  notVerified: 'Verify your email address to generate summaries.',
  notConfigured: 'Summaries are not available on this server.',
  paused: 'Summaries are paused for today.',
  quota: 'You have used your daily AI requests.',
} as const;

export const QUIZ_LIMITS = { countMin: 1, countMax: 20, countDefault: 5, topicMax: 200, answerMax: 500 } as const;

export const QUIZ_DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
] as const;

export const QUIZ_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True / false' },
  { value: 'short_answer', label: 'Short answer' },
] as const;

export const QUIZ_MESSAGES = {
  notVerified: 'Verify your email address to generate quizzes and request AI reviews.',
  notConfigured: 'Quiz generation is not available on this server.',
  paused: 'AI features are paused for today.',
  quota: 'You have used your daily AI requests.',
  generating: 'Writing your questions. This can take up to a minute.',
  noMaterials: 'You have no ready materials yet. Upload one on the Materials page, or use a topic.',
  loadFailed: 'This could not be loaded.',
  saveFailed: 'Your last answer could not be saved. It stays on this page and is sent when you submit.',
  reviewLabel: 'AI-judged review. It does not change your score.',
} as const;
