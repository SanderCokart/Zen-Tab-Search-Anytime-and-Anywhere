import { debugWarn } from "../../debug";
import { formatError, LOG_PREFIX } from "../log";
import { getZenTabsApi } from "./api";

export async function getCustomTabLabels(tabIds: number[]): Promise<Record<number, string>> {
  const zenTabs = getZenTabsApi();
  if (!zenTabs?.getCustomLabels) {
    return {};
  }

  try {
    return await zenTabs.getCustomLabels(tabIds);
  } catch (error) {
    debugWarn(`${LOG_PREFIX} Could not read Zen custom tab labels:`, formatError(error));
    return {};
  }
}
