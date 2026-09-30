import { navigateWithTransition } from '@vigil/design-system';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** Route change wrapped in the native View Transitions API (with fallback). */
export function useTransitionNavigate() {
  const navigate = useNavigate();
  return useCallback((to: string) => navigateWithTransition(to, (r) => navigate(r)), [navigate]);
}
