import type { TabSummary } from "@/shared/messaging/bridge-protocol";

export const GOOGLE_SERVICES = ["drive", "docs", "sheets", "slides", "calendar", "gmail"] as const;
export type GoogleService = (typeof GOOGLE_SERVICES)[number];

interface ServiceDefinition {
  /** Opened when the service is missing. No account index, so Google picks the default account. */
  url: string;
  host: string;
  /**
   * Home-page paths, including where Google redirects the canonical URL
   * (`/drive/my-drive`, `/mail/u/0/`, `/calendar/u/0/r/week`). A specific
   * document such as `/document/d/…` is not the Docs home page.
   */
  homePath: RegExp;
}

export const GOOGLE_SERVICE_DEFINITIONS: Record<GoogleService, ServiceDefinition> = {
  drive: {
    url: "https://drive.google.com/",
    host: "drive.google.com",
    homePath: /^\/(drive(\/u\/\d+)?(\/(my-drive|home))?)?\/?$/,
  },
  docs: {
    url: "https://docs.google.com/document/",
    host: "docs.google.com",
    homePath: /^\/document(\/u\/\d+)?\/?$/,
  },
  sheets: {
    url: "https://docs.google.com/spreadsheets/",
    host: "docs.google.com",
    homePath: /^\/spreadsheets(\/u\/\d+)?\/?$/,
  },
  slides: {
    url: "https://docs.google.com/presentation/",
    host: "docs.google.com",
    homePath: /^\/presentation(\/u\/\d+)?\/?$/,
  },
  calendar: {
    url: "https://calendar.google.com/",
    host: "calendar.google.com",
    homePath: /^\/(calendar(\/u\/\d+)?(\/r(\/.*)?)?)?\/?$/,
  },
  gmail: {
    url: "https://mail.google.com/",
    host: "mail.google.com",
    homePath: /^\/(mail(\/u\/\d+)?)?\/?$/,
  },
};

export function isServiceHome(service: GoogleService, url: string): boolean {
  const definition = GOOGLE_SERVICE_DEFINITIONS[service];
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === definition.host &&
      definition.homePath.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/** The first tab in `tabs` already showing the service's home page, if any. */
export function findServiceTab(service: GoogleService, tabs: TabSummary[]): TabSummary | undefined {
  return tabs.find((tab) => !tab.essential && isServiceHome(service, tab.url));
}
