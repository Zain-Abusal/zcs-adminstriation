import { createContext, useContext } from "react";
import { noAccess, permits, type WorkspaceAccess, type AccessAction } from "./access-model";
export const AccessContext = createContext<WorkspaceAccess>(noAccess);
export function useAccess() {
  const access = useContext(AccessContext);
  return {
    ...access,
    can: (page: string, action: AccessAction = "read") => permits(access, page, action),
  };
}
