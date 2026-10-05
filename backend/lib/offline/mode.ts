import { serverEnv } from "../env";

export function isOfflineMode(): boolean {
  return serverEnv().BYTEME_OFFLINE_MODE;
}