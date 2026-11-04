import { Navigate } from 'react-router-dom';

/** Compatibility for bookmarks from the former manual approval flow. */
export function PendingPage() {
  return <Navigate to="/onboarding" replace />;
}
