import type { User } from 'firebase/auth';

export type ActivityType =
  | 'login'
  | 'logout'
  | 'page_view'
  | 'profile_update'
  | 'search'
  | 'system_action'
  | 'agent_interaction'
  | 'chat_message'
  | 'group_join'
  | 'consent_request'
  | 'consent_approval';

export type ActivityInput = {
  type: ActivityType;
  title: string;
  resourceType?: string;
  resourceId?: string;
  visibility?: 'private' | 'connections' | 'public';
  metadata?: Record<string, unknown>;
};

export async function recordActivity(user: User | null | undefined, input: ActivityInput) {
  if (!user || user.isAnonymous) return;
  try {
    const token = await user.getIdToken();
    await fetch('/api/activity', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(input),
      keepalive: true
    });
  } catch (err) {
    console.warn('recordActivity failed', err);
  }
}

