export const MESSAGE_TYPES = {
  COLLECT_MESSAGES: "COLLECT_MESSAGES",
  DETECT_SOURCE: "DETECT_SOURCE",
} as const;

export const SOURCE_IDS = {
  FRESHDESK: "freshdesk",
  GITLAB: "gitlab",
} as const;

export type SourceId = (typeof SOURCE_IDS)[keyof typeof SOURCE_IDS];
