import React from "react";
import { AppInstallsBoard } from "./AppInstallsBoard";

/**
 * App installs page. All data loading lives in the client board (date filter,
 * 12s live polling for the feedback rail, CSV export of the filtered events).
 */
export default function AppInstallsPage() {
  return <AppInstallsBoard />;
}
